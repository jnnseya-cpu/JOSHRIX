/**
 * JOSHRIX runtime config.
 * Frontend deploys to Vercel; the backend API is a Firebase Cloud Function.
 * Set the function URL printed by `firebase deploy --only functions` here
 * (no trailing slash), e.g.:
 *   window.JOSHRIX_API_BASE = 'https://api-xxxxx-ew.a.run.app';
 * Leave '' when frontend and /api share one origin (single Vercel project
 * using the api/ mirror).
 */
window.JOSHRIX_API_BASE = window.JOSHRIX_API_BASE || '';

/**
 * Founder Pass pre-orders (pricing.html): create three Payment Links in the
 * Stripe Dashboard (Products → Payment Links) and paste them here to go live —
 * no other code needed. Until set, buttons fall back to signup.html.
 */
window.JOSHRIX_FOUNDER_LINKS = window.JOSHRIX_FOUNDER_LINKS || {
  // founder: 'https://buy.stripe.com/XXXX',
  // founder_pro: 'https://buy.stripe.com/YYYY',
  // first_studio: 'https://buy.stripe.com/ZZZZ',
};
