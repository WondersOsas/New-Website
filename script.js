// ============================================
// FLUID INK ANIMATION BACKGROUND
// ============================================
(function createInkBackground() {
    const inkBg = document.createElement('div');
    inkBg.className = 'ink-background';
    
    // Create fluid ink drops
    for (let i = 0; i < 6; i++) {
        const drop = document.createElement('div');
        drop.className = 'ink-drop';
        inkBg.appendChild(drop);
    }
    
    // Create ink burst particles
    for (let i = 0; i < 6; i++) {
        const particle = document.createElement('div');
        particle.className = 'ink-particle';
        inkBg.appendChild(particle);
    }
    
    document.body.prepend(inkBg);
})();

// ============================================
// NAVIGATION TOGGLE
// ============================================
const navToggle = document.querySelector('.nav-toggle');
const headerNav = document.querySelector('.header-nav');

if (navToggle && headerNav) {
    const openMenu = () => {
        headerNav.classList.add('open');
        navToggle.setAttribute('aria-expanded', 'true');
    };

    const closeMenu = () => {
        headerNav.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
    };

    navToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = headerNav.classList.contains('open');
        if (isOpen) closeMenu();
        else openMenu();
    });

    navToggle.addEventListener('mouseenter', openMenu);
    headerNav.addEventListener('mouseenter', openMenu);
    headerNav.addEventListener('mouseleave', closeMenu);

    document.addEventListener('click', (event) => {
        if (!headerNav.contains(event.target) && !navToggle.contains(event.target)) {
            closeMenu();
        }
    });
}

// ============================================
// CONTACT FORM / CSRF
// ============================================
const contactForm = document.getElementById('contactForm');
const csrfTokenInput = document.getElementById('csrfToken');

if (contactForm && csrfTokenInput) {
    const fetchCsrfToken = async () => {
        try {
            const response = await fetch('/csrf-token', { method: 'GET', credentials: 'same-origin' });
            const data = await response.json();
            if (data.csrfToken) {
                csrfTokenInput.value = data.csrfToken;
            }
        } catch (error) {
            console.error('CSRF token fetch failed:', error);
        }
    };

    contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(contactForm);
        const payload = {
            name: formData.get('name')?.toString() || '',
            email: formData.get('email')?.toString() || '',
            message: formData.get('message')?.toString() || '',
            csrfToken: formData.get('csrfToken')?.toString() || ''
        };

        const existingMessage = contactForm.querySelector('.form-status');
        if (existingMessage) existingMessage.remove();

        try {
            const response = await fetch('/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            const statusMessage = document.createElement('p');
            statusMessage.className = 'form-status';
            statusMessage.textContent = data.success ? 'Review sent securely. Redirecting to reviews page...' : data.error || 'Submission failed.';
            contactForm.appendChild(statusMessage);

            if (data.success) {
                contactForm.reset();
                await fetchCsrfToken();
                window.location.href = 'reviews.html';
            }
        } catch (error) {
            console.error('Contact form submission failed:', error);
            const errorMessage = document.createElement('p');
            errorMessage.className = 'form-status';
            errorMessage.textContent = 'Submission failed. Please try again.';
            contactForm.appendChild(errorMessage);
        }
    });

    fetchCsrfToken();
}

// ============================================
// REVIEWS PAGE
// ============================================
const reviewsList = document.getElementById('reviewsList');

if (reviewsList) {
    const renderReviews = async () => {
        reviewsList.innerHTML = '<p class="loading">Loading reviews...</p>';

        try {
            const response = await fetch('/reviews', { credentials: 'same-origin' });
            const data = await response.json();

            if (!data.success || !Array.isArray(data.reviews) || data.reviews.length === 0) {
                reviewsList.innerHTML = '<p class="empty-state">No reviews yet. Be the first to share your experience.</p>';
                return;
            }

            reviewsList.innerHTML = '';
            data.reviews.slice().reverse().forEach((review) => {
                const card = document.createElement('article');
                card.className = 'review-card';

                const name = document.createElement('h3');
                name.textContent = review.name || 'Anonymous';

                const meta = document.createElement('p');
                meta.className = 'review-meta';
                meta.textContent = new Date(review.createdAt).toLocaleString();

                const message = document.createElement('p');
                message.className = 'review-message';
                message.textContent = review.message || '';

                card.appendChild(name);
                card.appendChild(meta);
                card.appendChild(message);
                reviewsList.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to load reviews:', error);
            reviewsList.innerHTML = '<p class="empty-state">Unable to load reviews right now.</p>';
        }
    };

    renderReviews();
}

// ============================================
// TESTIMONIAL SLIDER
// ============================================
const testimonialSlider = document.querySelector('.testimonial-slider');
const testimonialTrack = document.querySelector('.testimonial-track');
const testimonialArrows = document.querySelectorAll('.testimonial-arrow');

if (testimonialSlider && testimonialTrack) {
    let isPaused = false;
    let loopTimer = null;
    let currentOffset = 0;

    const getDistance = () => Math.max(0, testimonialTrack.scrollWidth - testimonialSlider.clientWidth);

    const slideTestimonials = (direction) => {
        const distance = getDistance();
        if (distance <= 0) return;

        if (direction === 'left') {
            currentOffset = Math.max(currentOffset - 320, 0);
        } else if (direction === 'right') {
            currentOffset = Math.min(currentOffset + 320, distance);
        } else {
            currentOffset = 0;
            testimonialTrack.style.transition = 'none';
            testimonialTrack.style.transform = 'translateX(0)';
            requestAnimationFrame(() => {
                testimonialTrack.style.transition = 'transform 0.85s cubic-bezier(0.22, 0.61, 0.36, 1)';
            });
            return;
        }

        testimonialTrack.style.transition = 'transform 0.85s cubic-bezier(0.22, 0.61, 0.36, 1)';
        testimonialTrack.style.transform = `translateX(-${currentOffset}px)`;
    };

    const startLoop = () => {
        clearInterval(loopTimer);
        loopTimer = setInterval(() => {
            if (!isPaused) {
                slideTestimonials('auto');
            }
        }, 5000);
    };

    testimonialSlider.addEventListener('mouseenter', () => { isPaused = true; });
    testimonialSlider.addEventListener('mouseleave', () => { isPaused = false; });

    testimonialArrows.forEach((button) => {
        button.addEventListener('click', () => {
            const direction = button.dataset.direction;
            isPaused = true;
            clearInterval(loopTimer);
            slideTestimonials(direction);
            setTimeout(() => {
                isPaused = false;
                startLoop();
            }, 8000);
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) startLoop();
        });
    }, { threshold: 0.3 });

    observer.observe(testimonialSlider);

    window.addEventListener('resize', () => {
        if (!isPaused) {
            currentOffset = 0;
            testimonialTrack.style.transition = 'none';
            testimonialTrack.style.transform = 'translateX(0)';
        }
    });
}

// ============================================
// ADD TO CART
// ============================================
const addToCartButtons = document.querySelectorAll('.card button');

addToCartButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
        event.preventDefault();

        const card = button.closest('.card');
        if (!card) return;

        const image = card.querySelector('img')?.src || '';
        const title = card.querySelector('h1, h3')?.textContent || 'Product';
        const priceText = card.querySelector('.price')?.textContent || '#0.00';
        const description = card.querySelectorAll('p')[1]?.textContent || '';

        const product = { image, title, price: priceText, description };

        localStorage.setItem('cartProduct', JSON.stringify(product));
        window.location.href = 'cart.html';
    });
});

// ============================================
// CART PAGE
// ============================================
if (document.body.classList.contains('cart-page') || window.location.pathname.includes('cart.html')) {
    const displayCart = () => {
        const cartContent = document.getElementById('cartContent');
        const productData = localStorage.getItem('cartProduct');

        if (!cartContent) return;

        if (!productData) {
            cartContent.innerHTML = `
                <div class="empty-cart">
                    <h2>Your Cart is Empty</h2>
                    <p>No items have been added to your cart yet.</p>
                    <a href="gallery.html">Continue Shopping</a>
                </div>
            `;
            return;
        }

        const product = JSON.parse(productData);

        cartContent.innerHTML = `
            <div class="cart-product">
                <div class="cart-product-wrapper">
                    <img src="${product.image}" alt="${product.title}">
                    <div class="cart-product-details">
                        <h2>${product.title}</h2>
                        <p class="price">${product.price}</p>
                        <p>${product.description}</p>
                        <div class="cart-actions">
                            <button class="payment-btn" onclick="handlePayment()">Proceed to Payment</button>
                            <a href="gallery.html" class="continue-shopping">Continue Shopping</a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    };

    window.handlePayment = function() {
        window.location.href = 'payment.html';
    };

    displayCart();
}

// ============================================
// PAYMENT PAGE
// ============================================
if (document.body.classList.contains('payment-page') || window.location.pathname.includes('payment.html')) {
    const displayPaymentSummary = () => {
        const summaryDiv = document.getElementById('paymentSummary');
        const transferAmountSpan = document.getElementById('transferAmount');
        const productData = localStorage.getItem('cartProduct');

        if (!productData) {
            summaryDiv.innerHTML = `
                <div class="empty-cart">
                    <h2>No Product Selected</h2>
                    <p>Please add a product to your cart first.</p>
                    <a href="gallery.html">Go to Gallery</a>
                </div>
            `;
            return;
        }

        const product = JSON.parse(productData);

        summaryDiv.innerHTML = `
            <div class="payment-summary-grid">
                <div class="payment-summary-image">
                    <img src="${product.image}" alt="${product.title}">
                </div>
                <div class="payment-summary-info">
                    <h3>${product.title}</h3>
                    <p class="price" style="font-size: 24px; margin: 10px 0;">${product.price}</p>
                    <p>${product.description}</p>
                </div>
            </div>
        `;

        transferAmountSpan.textContent = product.price;
        generateQRCode(product);
        initializePaystack(product);
    };

    const generateQRCode = (product) => {
        const qrContainer = document.getElementById('qrCodeContainer');
        const priceValue = product.price.replace(/[^0-9]/g, '');
        const qrData = `TrewJewel Payment\nProduct: ${product.title}\nAmount: ${product.price}`;

        qrContainer.innerHTML = '';
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`;

        qrContainer.innerHTML = `
            <div style="text-align: center;">
                <img src="${qrCodeUrl}" alt="QR Code for ${product.title}" style="max-width: 300px; border-radius: 12px; border: 2px solid #d48ba3;">
                <p style="margin-top: 15px; color: #5f6d85;">Scan this code to view payment details</p>
            </div>
        `;
    };

    const initializePaystack = (product) => {
        const paystackPayBtn = document.getElementById('paystackPayBtn');
        if (!paystackPayBtn) return;

        const priceValue = product.price.replace(/[^0-9]/g, '');
        const amount = parseInt(priceValue) * 100;

        paystackPayBtn.addEventListener('click', function() {
            if (typeof PaystackPop === 'undefined') {
                alert('Payment system is loading. Please try again in a moment.');
                return;
            }

            const handler = PaystackPop.setup({
                key: 'pk_test_YOUR_PUBLIC_KEY_HERE',
                email: 'customer@example.com',
                amount: amount,
                ref: 'TrewJewel_' + Math.floor((Math.random() * 1000000000) + 1),
                onClose: function() {
                    alert('Payment window closed.');
                },
                onSuccess: function(response) {
                    alert('Payment successful! Reference: ' + response.reference);
                    console.log('Payment successful:', response);
                    localStorage.removeItem('cartProduct');
                    window.location.href = 'home.html';
                }
            });
            handler.openIframe();
        });
    };

    displayPaymentSummary();
}