/**
 * JOSHRIX runtime config.
 * When the frontend is hosted on Firebase Hosting and the backend API on Vercel,
 * set the Vercel deployment URL here (no trailing slash), e.g.:
 *   window.JOSHRIX_API_BASE = 'https://joshrix.vercel.app';
 * Leave '' when frontend and /api share one origin (single Vercel project).
 */
window.JOSHRIX_API_BASE = window.JOSHRIX_API_BASE || '';
