/**
 * JOSHRIX Studio service worker — the PWA layer.
 * Strategy: never touch /api/ (payments and AI must always be live);
 * cache-first for versioned static assets; network-first with cache
 * fallback for pages, so the app opens instantly and survives offline.
 */
const VERSION = 'jx-v6';
// Clean URLs only: Vercel cleanUrls 308-redirects /x.html → /x, and a cached
// redirected response served for a navigation makes Chrome throw — so we cache
// the canonical paths, and installs never fail on one missing page.
const CORE = [
  '/', '/studio', '/play3d', '/wallet', '/pricing', '/play', '/arcade',
  '/assets/joshrix.css', '/assets/site.js', '/assets/install.js', '/assets/config.js', '/manifest.webmanifest',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // money and AI are never cached

  // static assets: cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  // pages: network-first, cache fallback (fresh when online, working when not)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match('/')))
  );
});
