/* JOSHRIX Studio — shared page behavior: starfield, reveals, active nav */
/* Site-wide account presence: every page must show the account chip (signed in)
   or a Sign In button (signed out) — load identity.js wherever the page didn't. */
(() => {
  if (!window.__jxIdentity && !document.querySelector('script[src*="identity.js"]')) {
    const s = document.createElement('script');
    s.src = '/assets/identity.js';
    document.head.appendChild(s);
  }
})();
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The starfield is gone. It drew 160 twinkling violet and cyan dots behind
     every page — the decoration that says "sci-fi template" loudest, and a
     requestAnimationFrame loop running for the life of every session to do
     it. The design system hides #stars, so this was painting something
     nobody could see; the canvas element stays in the markup harmlessly. */

  // scroll reveal
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // active nav link
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === here) a.classList.add('active');
  });

  // account-type selector (signup)
  document.querySelectorAll('.acct').forEach(el => el.addEventListener('click', () => {
    document.querySelectorAll('.acct').forEach(x => x.classList.remove('sel'));
    el.classList.add('sel');
    const input = document.getElementById('accountType');
    if (input) input.value = el.dataset.type || '';
  }));

  // demo forms
  document.querySelectorAll('form[data-demo]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const note = f.querySelector('.form-note') || f.appendChild(Object.assign(document.createElement('p'), { className: 'form-note hint' }));
    note.textContent = '✓ Received — this is a front-end prototype; the API wiring lands with the backend build.';
  }));
})();

/* PWA: register the service worker (idempotent, silent on unsupported browsers) */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

/* PWA install chip + nav identity live in their own files so the landing page
   (which does not load site.js) can use them too — see assets/install.js and
   assets/identity.js */
(() => {
  ['/assets/install.js', '/assets/identity.js'].forEach((src) => {
    const s = document.createElement('script');
    s.src = src;
    s.defer = true;
    document.head.appendChild(s);
  });
})();
