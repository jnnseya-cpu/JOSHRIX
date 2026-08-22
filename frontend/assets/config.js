window.JOSHRIX_BUILD = '2026-07-29.26';
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

/**
 * Firebase Auth (signup/login). Paste your Firebase project's WEB APP config
 * here (Firebase console → Project settings → Your apps → Web app). These
 * client keys are public by design — security lives in Firebase rules.
 * Until set, signup/login run in demo mode.
 */
window.JOSHRIX_FIREBASE_CONFIG = window.JOSHRIX_FIREBASE_CONFIG || {
  apiKey: "AIzaSyBe64K4LZXGSJFuPQ7muXhHFXAAvWnacfo",
  authDomain: "tradeconnect-tzm9l.firebaseapp.com",
  projectId: "tradeconnect-tzm9l",
  storageBucket: "tradeconnect-tzm9l.firebasestorage.app",
  messagingSenderId: "867833032711",
  appId: "1:867833032711:web:18aa35cd58fca5f0bbfaa2",
  measurementId: "G-N64P209G6Y"
};

/**
 * Advertising tags — Meta Pixel and Google Tag.
 *
 * BOTH ARE PUBLIC IDs BY DESIGN. A Pixel ID and a GA4 measurement ID are
 * visible in the page source of every site that uses them; they are not
 * secrets and must never be handled as ones. Paste yours here and deploy.
 *
 *   Meta Pixel ID   Events Manager -> Data sources -> your pixel  (15-16 digits)
 *   Google tag ID   GA4 Admin -> Data streams -> your web stream  ("G-XXXXXXXXXX")
 *                   or a Google Ads conversion tag ("AW-XXXXXXXXX")
 *
 * Leave either empty and that platform is never loaded — no script, no cookie,
 * no request. With BOTH empty no consent banner appears at all, because there
 * is nothing to consent to.
 *
 * Nothing third-party loads before the visitor accepts. See assets/pixels.js.
 */
window.JOSHRIX_META_PIXEL_ID = window.JOSHRIX_META_PIXEL_ID || '';
window.JOSHRIX_GA_ID = window.JOSHRIX_GA_ID || '';
