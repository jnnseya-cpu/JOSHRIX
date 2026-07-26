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
