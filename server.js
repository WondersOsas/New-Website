const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Hono } = require("hono");
const { readFile } = require("fs/promises");
const crypto = require("crypto");

// Load environment variables from .env (THIS IS THE ONLY SOURCE OF TRUTH for credentials)
try {
    const dotenv = require("dotenv");
    dotenv.config();
} catch (e) {
    // dotenv not available, fallback to process.env
}

const app = new Hono();

// ==========================================
// SECURITY CREDENTIALS - Only from env vars
// ==========================================
// These CANNOT be read from the code - they MUST be in .env file
// The .env file is in .gitignore so it's NEVER committed to the repo
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || null;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || null;
const PRIVATE_API_KEY = process.env.PRIVATE_API_KEY || null;

// Warn if credentials are not set up
if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !PRIVATE_API_KEY) {
    console.log("⚠️  WARNING: Security credentials not found in .env file!");
    console.log("   Create a .env file with ADMIN_USERNAME, ADMIN_PASSWORD, and PRIVATE_API_KEY");
    console.log("   Without these, the server will reject all admin and private API requests.\n");
}

// ==========================================
// SSL Certificate Generation (Development)
// ==========================================
const certDir = path.join(__dirname, "certs");
if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
}

const keyPath = path.join(certDir, "key.pem");
const certPath = path.join(certDir, "cert.pem");

let httpsOptions = null;

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.log("🔐 Generating self-signed SSL certificate for local HTTPS...");
    try {
        const { execSync } = require("child_process");
        execSync(
            `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=localhost" 2>nul`,
            { stdio: "ignore", timeout: 10000 }
        );
        
        if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
            console.log("✅ SSL certificate generated using OpenSSL");
        } else {
            console.log("⚠️  OpenSSL not available. Install it or create certs manually.");
            console.log("   The server will still run on HTTP.");
        }
    } catch (e) {
        console.log("⚠️  Could not generate SSL certificate. HTTP only.");
    }
}

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
        httpsOptions = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };
    } catch (e) {
        console.log("⚠️  Could not read SSL certificates. HTTP only.");
    }
}

// ==========================================
// Application Settings
// ==========================================
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitStore = new Map();
const submittedMessages = new Set();
const reviewEntries = [];
const sessions = new Map();

const suspiciousPatterns = [
    /<script[\s\S]*?>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /\b(select|union|insert|delete|drop|update|from|where)\b/i,
    /(\.\.\/|\/etc\/passwd|%2e%2e)/i,
    /\b(or|and)\s+1=1\b/i
];

const getClientIp = (c) => {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return c.req.header("x-real-ip") || "unknown";
};

const normalizeInput = (value) => {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
};

const containsSuspiciousContent = (value) => suspiciousPatterns.some((pattern) => pattern.test(value));

const parseRequestBody = async (c) => {
    const contentType = c.req.header("content-type") || "";
    if (contentType.includes("application/json")) {
        try { return await c.req.json(); } catch (error) { return {}; }
    }
    return await c.req.parseBody();
};

const enforceRateLimit = (c) => {
    const ip = getClientIp(c);
    const now = Date.now();
    const entry = rateLimitStore.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
    }
    entry.count += 1;
    rateLimitStore.set(ip, entry);
    return entry.count <= RATE_LIMIT_MAX;
};

const generateCsrfToken = () => {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const generateSessionId = () => {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const csrfTokens = new Map();

// ==========================================
// PRIVATE API KEY AUTHENTICATION MIDDLEWARE
// ==========================================
// Only YOU (the owner) can access these routes.
// You must pass your PRIVATE_API_KEY in the "x-private-key" header.
// This key is stored in .env which is NEVER committed to git.
const requirePrivateKey = async (c, next) => {
    // If no key configured, block everything
    if (!PRIVATE_API_KEY) {
        return c.json({ 
            error: "Server not configured. Owner must set PRIVATE_API_KEY in .env file." 
        }, 503);
    }

    const providedKey = c.req.header("x-private-key");
    
    if (!providedKey) {
        return c.json({ 
            error: "Unauthorized. Provide your private API key in the 'x-private-key' header." 
        }, 401);
    }

    // Constant-time comparison to prevent timing attacks
    const providedHash = crypto.createHash("sha256").update(providedKey).digest();
    const realHash = crypto.createHash("sha256").update(PRIVATE_API_KEY).digest();
    
    if (providedHash.length !== realHash.length || !crypto.timingSafeEqual(providedHash, realHash)) {
        return c.json({ error: "Invalid private API key." }, 403);
    }

    return next();
};

// ==========================================
// SESSION-BASED ADMIN MIDDLEWARE (for admin login)
// ==========================================
const requireAdmin = async (c, next) => {
    const sessionId = c.req.header("x-session-id");
    const session = sessionId ? sessions.get(sessionId) : null;
    if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(sessionId);
        return c.json({ error: "Unauthorized - session expired or invalid" }, 401);
    }
    return next();
};

// ==========================================
// Middleware
// ==========================================
app.use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (!["GET", "POST", "OPTIONS"].includes(method)) {
        return c.json({ error: "Method not allowed" }, 405);
    }

    const url = new URL(c.req.url);
    const pathname = url.pathname;

    if (/[<>"'`]/.test(pathname) || /%2e%2e|\/\.\//i.test(pathname) || pathname.includes("..")) {
        c.header("Cache-Control", "no-store");
        return c.json({ error: "Invalid request path" }, 400);
    }

    if (!enforceRateLimit(c)) {
        c.header("Retry-After", "60");
        return c.json({ error: "Too many requests" }, 429);
    }

    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    c.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' https://js.paystack.co 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
    );
    c.header("X-XSS-Protection", "1; mode=block");

    await next();
});

app.onError((err, c) => {
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error" }, 500);
});

// ==========================================
// PUBLIC API ROUTES
// ==========================================
app.get("/", (c) => {
    return c.json({ status: "ok", message: "TrewJewel site is running securely." });
});

app.get("/csrf-token", (c) => {
    const token = generateCsrfToken();
    csrfTokens.set(token, Date.now() + 15 * 60 * 1000);
    return c.json({ csrfToken: token });
});

// ==========================================
// PRIVATE API ROUTES - REQUIRES X-PRIVATE-KEY HEADER
// ==========================================
// These routes are ONLY accessible with your private API key from .env
// Even if someone reads the code, they cannot access these without the key.

// Get the current server security status
app.get("/api/private/status", requirePrivateKey, (c) => {
    return c.json({
        success: true,
        server: "TrewJewel Private API",
        version: "1.0.0",
        uptime: process.uptime(),
        adminConfigured: !!ADMIN_USERNAME,
        sessionCount: sessions.size,
        reviewsCount: reviewEntries.length,
        rateLimitStoreSize: rateLimitStore.size
    });
});

// View all stored reviews with full details (including emails)
app.get("/api/private/reviews", requirePrivateKey, (c) => {
    return c.json({
        success: true,
        total: reviewEntries.length,
        reviews: reviewEntries
    });
});

// View all active sessions
app.get("/api/private/sessions", requirePrivateKey, (c) => {
    const activeSessions = [];
    for (const [id, data] of sessions.entries()) {
        if (data.expiresAt > Date.now()) {
            activeSessions.push({
                sessionId: id.slice(0, 12) + "...",
                createdAt: new Date(data.createdAt).toISOString(),
                expiresAt: new Date(data.expiresAt).toISOString()
            });
        }
    }
    return c.json({
        success: true,
        activeSessions: activeSessions.length,
        sessions: activeSessions
    });
});

// Delete all sessions (force logout all admin users)
app.post("/api/private/sessions/clear", requirePrivateKey, (c) => {
    sessions.clear();
    return c.json({ success: true, message: "All admin sessions cleared." });
});

// Delete a specific review by ID
app.post("/api/private/reviews/delete", requirePrivateKey, async (c) => {
    const body = await c.req.parseBody();
    const reviewId = normalizeInput(body.id || "");
    
    const index = reviewEntries.findIndex(r => r.id === reviewId);
    if (index === -1) {
        return c.json({ error: "Review not found" }, 404);
    }
    
    reviewEntries.splice(index, 1);
    return c.json({ success: true, message: "Review deleted." });
});

// Clear all reviews
app.post("/api/private/reviews/clear", requirePrivateKey, (c) => {
    reviewEntries.length = 0;
    submittedMessages.clear();
    return c.json({ success: true, message: "All reviews cleared." });
});

// ==========================================
// ADMIN ROUTES (session-based, for admin dashboard)
// ==========================================
app.post("/admin/login", async (c) => {
    // If credentials not configured, reject
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
        return c.json({ 
            error: "Admin not configured. Owner must set ADMIN_USERNAME and ADMIN_PASSWORD in .env file." 
        }, 503);
    }

    const body = await c.req.parseBody();
    const username = normalizeInput(body.username || "");
    const password = normalizeInput(body.password || "");

    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        return c.json({ error: "Invalid admin credentials" }, 401);
    }

    const sessionId = generateSessionId();
    sessions.set(sessionId, { 
        createdAt: Date.now(), 
        expiresAt: Date.now() + 60 * 60 * 1000 
    });

    return c.json({ success: true, sessionId });
});

app.get("/admin/dashboard", requireAdmin, (c) => {
    return c.json({ 
        success: true, 
        message: "Welcome to the admin dashboard.",
        reviewCount: reviewEntries.length
    });
});

app.get("/admin/reviews", requireAdmin, (c) => {
    return c.json({ success: true, reviews: reviewEntries.slice(0, 50) });
});

app.get("/reviews", (c) => {
    return c.json({ success: true, reviews: reviewEntries.slice(0, 50) });
});

app.post("/contact", async (c) => {
    const body = await parseRequestBody(c);
    const csrfToken = normalizeInput(body.csrfToken || "");
    const name = normalizeInput(body.name || "");
    const email = normalizeInput(body.email || "");
    const message = normalizeInput(body.message || "");

    if (!csrfToken || !csrfTokens.has(csrfToken)) {
        return c.json({ error: "Invalid security token" }, 403);
    }

    csrfTokens.delete(csrfToken);

    if (!name || !email || !message) {
        return c.json({ error: "All fields are required" }, 400);
    }

    if (name.length > 80 || message.length > 1000) {
        return c.json({ error: "Input too long" }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return c.json({ error: "Valid email required" }, 400);
    }

    const fingerprint = `${name}:${email}:${message}`.toLowerCase();
    if (submittedMessages.has(fingerprint)) {
        return c.json({ error: "Duplicate submission detected" }, 409);
    }

    if (containsSuspiciousContent(`${name} ${email} ${message}`)) {
        return c.json({ error: "Suspicious content detected" }, 400);
    }

    submittedMessages.add(fingerprint);
    reviewEntries.unshift({
        id: `${Date.now()}`,
        name,
        email,
        message,
        createdAt: new Date().toISOString()
    });

    return c.json({ success: true, message: "Review received securely." });
});

// ==========================================
// Static File Serving
// ==========================================
app.get("/*", async (c) => {
    const url = new URL(c.req.url);
    let filePath = url.pathname;

    if (filePath === "/" || filePath === "") {
        filePath = "/home.html";
    }

    const normalizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const fullPath = path.join(__dirname, normalizedPath);

    if (!fullPath.startsWith(__dirname)) {
        return c.json({ error: "Forbidden" }, 403);
    }

    try {
        const content = await readFile(fullPath);
        const ext = path.extname(fullPath).toLowerCase();

        const mimeTypes = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".json": "application/json",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".pdf": "application/pdf",
            ".md": "text/markdown",
        };

        const contentType = mimeTypes[ext] || "application/octet-stream";
        c.header("Content-Type", contentType);
        return c.body(content);
    } catch (err) {
        return c.json({ error: "Not found" }, 404);
    }
});

// ==========================================
// Server Startup (HTTP + HTTPS)
// ==========================================
const HTTP_PORT = process.env.HTTP_PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// HTTP server - redirects to HTTPS if available, otherwise serves directly
const httpServer = http.createServer((req, res) => {
    if (httpsOptions && req.headers.host) {
        const host = req.headers.host.replace(/:\d+$/, "");
        res.writeHead(301, { Location: `https://${host}:${HTTPS_PORT}${req.url}` });
        res.end();
    } else {
        app.fetch(req, res);
    }
});

httpServer.listen(HTTP_PORT, () => {
    console.log(`🌐  HTTP:  http://localhost:${HTTP_PORT}`);
});

// HTTPS server (optional - requires SSL certs)
if (httpsOptions) {
    const httpsServer = https.createServer(httpsOptions, (req, res) => {
        app.fetch(req, res);
    });

    httpsServer.listen(HTTPS_PORT, () => {
        console.log(`🔒  HTTPS: https://localhost:${HTTPS_PORT}`);
        console.log(`    ⚠️  Self-signed cert - accept browser warning`);
    });
} else {
    console.log(`    💡  For HTTPS: Install OpenSSL, then run: npm run generate-certs`);
}

console.log(`📁  Serving: ${__dirname}`);
console.log(`✨  TrewJewel server ready!`);

if (PRIVATE_API_KEY) {
    console.log(`🔐  Private API: ACTIVE (use x-private-key header)`);
} else {
    console.log(`❌  Private API: DISABLED (set PRIVATE_API_KEY in .env)`);
}

module.exports = app;