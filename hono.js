const { Hono } = require("hono");

const app = new Hono();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitStore = new Map();
const submittedMessages = new Set();
const reviewEntries = [];
const sessions = new Map();
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "TrewJewel2026!";

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
    try {
      return await c.req.json();
    } catch (error) {
      return {};
    }
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

const requireAdmin = (c, next) => {
  const sessionId = c.req.header("x-session-id");
  const session = sessionId ? sessions.get(sessionId) : null;

  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
};

app.use("*", async (c, next) => {
  const method = c.req.method.toUpperCase();
  const path = new URL(c.req.url).pathname;

  if (!["GET", "POST", "OPTIONS"].includes(method)) {
    return c.json({ error: "Method not allowed" }, 405);
  }

  if (/[<>"'`]/.test(path) || /%2e%2e|\/\.\//i.test(path) || path.includes("..")) {
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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
  );
  c.header("X-XSS-Protection", "1; mode=block");
  c.header("Cache-Control", "no-store");

  await next();
});

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/", (c) => {
  return c.json({ status: "ok", message: "TrewJewel site is running securely." });
});

app.get("/csrf-token", (c) => {
  const token = generateCsrfToken();
  csrfTokens.set(token, Date.now() + 15 * 60 * 1000);
  return c.json({ csrfToken: token });
});

app.post("/admin/login", async (c) => {
  const body = await c.req.parseBody();
  const username = normalizeInput(body.username || "");
  const password = normalizeInput(body.password || "");

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return c.json({ error: "Invalid admin credentials" }, 401);
  }

  const sessionId = generateSessionId();
  sessions.set(sessionId, { createdAt: Date.now(), expiresAt: Date.now() + 60 * 60 * 1000 });

  return c.json({ success: true, sessionId });
});

app.get("/admin/dashboard", requireAdmin, (c) => {
  return c.json({ success: true, message: "Welcome to the admin dashboard." });
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

module.exports = app;
