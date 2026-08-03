// Where parent orders are emailed (FormSubmit).
window.BAND_PHOTO_ORDER_EMAIL = "AllysonreneeLCS@gmail.com";

// Stripe Checkout API (Vercel serverless). After you deploy the /api folder to Vercel,
// paste the function URL base here, e.g.:
//   "https://glendale-band-photo-packages.vercel.app/api/create-checkout-session"
// Leave empty or REPLACE to disable online card payments until set up.
window.STRIPE_CHECKOUT_API_URL = "https://glendale-band-photo-packages.vercel.app/api/create-checkout-session";

// Optional: Stripe publishable key (pk_test_... / pk_live_...).
// Not required for Checkout redirect flow, but useful if you add Stripe.js later.
window.STRIPE_PUBLISHABLE_KEY = "pk_test_REPLACE_ME";
