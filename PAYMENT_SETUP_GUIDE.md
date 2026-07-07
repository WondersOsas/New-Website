# Payment Integration Setup Guide

## Overview

Your TrewJewel Bridal Store now has a complete payment system with 3 payment methods:

1. **Paystack Integration** - Card/Bank Transfer (with Paystack modal)
2. **QR Code Payment** - Scannable QR code with payment details
3. **Direct Bank Transfer** - Manual bank transfer details

---

## Setting Up Paystack (Recommended)

### Step 1: Create Paystack Account

1. Go to https://dashboard.paystack.co/
2. Sign up for a free account (or login if you have one)
3. Complete KYC verification
4. Activate your account

### Step 2: Get Your API Keys

1. Go to Settings → API Keys & Webhooks
2. Copy your **Public Key** (starts with `pk_`)
3. Keep your **Secret Key** safe (for backend)

### Step 3: Update Payment Script

In `script.js`, find line 256 and replace `YOUR_PUBLIC_KEY_HERE` with your actual Paystack public key:

```javascript
key: 'pk_live_YOUR_ACTUAL_KEY_HERE', // Replace this
email: 'customer@example.com',
amount: amount,
```

### Step 4: Test Payment

- Use Paystack test cards: 4084084084084081 (Card PIN: any 4 digits)
- Once verified, change `pk_test_` to `pk_live_` for live payments

---

## Payment Flow

### User Journey:

1. User adds product to cart
2. Clicks "Proceed to Payment"
3. Redirected to `payment.html`
4. Sees 3 payment options:
   - **Paystack Button** → Opens payment modal
   - **QR Code** → Can scan with payment app
   - **Bank Details** → Manual transfer info

### Payment Methods Details:

#### 💳 Paystack (Card/Bank Transfer)

- Secure payment gateway
- Accepts: Cards, Bank Transfer, USSD
- Instant confirmation
- Money goes directly to your Paystack account

#### 📱 QR Code

- Displays scannable QR with amount & product info
- User scans with their payment app
- Can be used with any payment system

#### 🏦 Direct Bank Transfer

- Account Number: 2000123456
- Bank: First Bank Nigeria
- Edit bank details in `payment.html` (lines 48-51)

---

## Editing Payment Details

### Change Bank Account Info:

Open `payment.html` and find:

```html
<p><strong>Account Number:</strong> 2000123456</p>
```

Update with your actual bank details.

### Change Store Email:

In `script.js`, update line 253:

```javascript
email: 'your-store@email.com',
```

---

## What Happens After Payment?

### Paystack Payment Success:

- Customer sees success message
- Reference number is displayed
- Cart is cleared
- User redirected to home page

### Manual Bank Transfer:

- Customer sends proof of payment
- You verify and manually confirm order
- Send customer their product details via email/WhatsApp

---

## Testing Checklist

- [ ] Add product to cart ✓
- [ ] Click "Proceed to Payment" ✓
- [ ] See payment page with product summary
- [ ] See 3 payment methods
- [ ] QR code generates correctly
- [ ] Paystack button works
- [ ] Bank details display correctly
- [ ] Can return to cart
- [ ] Can continue shopping

---

## Support & Customization

### To Add More Payment Methods:

1. Add new `<div class="payment-method-card">` in payment.html
2. Add handler function in script.js

### To Change Currency:

- Currently using Naira (#)
- Update in all product prices and payment.html

### For Production:

1. Upgrade to Live Paystack keys
2. Set up email notifications
3. Store payment records in database
4. Add order tracking system

---

## Important Notes

⚠️ **Security**:

- Never share your Secret Key
- Always use HTTPS in production
- Validate payments on your backend

💾 **Data Storage**:

- Currently uses browser localStorage
- For production, store in database
- Keep payment records for accounting

📧 **Customer Communication**:

- Send payment confirmation emails
- Track order status
- Provide customer support

---

## Contact Information

For issues or customization:

- Paystack Support: https://paystack.com/support
- Your Store: Update contact details in contact.html

Last Updated: 2026-07-06
