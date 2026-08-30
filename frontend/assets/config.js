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

/**
 * REFERRAL ATTRIBUTION — capture the partner's code before it is lost.
 *
 * A referral link is https://www.joshrix.com/?ref=JX-HANDLE, and the person who
 * clicks it almost never signs up on that first page view: they read, they
 * leave, they come back through the arcade or a search. So the code has to
 * survive the visit, not just the page.
 *
 * Kept separately from the traffic-source ?ref= that assets/track.js reads —
 * that one labels where a visit came from and is deliberately loose. This one
 * is a payable identifier, so it only accepts the exact JX- shape the server
 * will attribute, and it never overwrites a code already captured: the FIRST
 * partner to bring someone is the one who gets paid, not the last.
 */
(function () {
  try {
    var m = location.search.match(/[?&]ref=(JX-[A-Za-z0-9_-]{2,24})(?:&|$)/);
    if (m && !localStorage.getItem('jx.ref')) localStorage.setItem('jx.ref', m[1].toUpperCase());
  } catch (e) { /* private browsing — attribution is best-effort, never blocking */ }
  window.jxRef = function () {
    try { return localStorage.getItem('jx.ref') || undefined; } catch (e) { return undefined; }
  };
})();
