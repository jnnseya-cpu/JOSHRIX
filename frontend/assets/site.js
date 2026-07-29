/* JOSHRIX Studio — shared page behavior: starfield, reveals, active nav */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // starfield
  const cv = document.getElementById('stars');
  if (cv) {
    const cx = cv.getContext('2d');
    let W, H, stars = [];
    const size = () => {
      W = cv.width = innerWidth * devicePixelRatio;
      H = cv.height = innerHeight * devicePixelRatio;
      cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
      stars = Array.from({ length: Math.min(160, innerWidth / 8) }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        z: Math.random() * 0.8 + 0.2, r: Math.random() * 1.3 + 0.3,
        tw: Math.random() * Math.PI * 2,
        hue: Math.random() < 0.18 ? 'rgba(34,211,238,' : Math.random() < 0.3 ? 'rgba(168,85,247,' : 'rgba(244,244,250,'
      }));
    };
    size(); addEventListener('resize', size);
    let t = 0;
    (function draw() {
      cx.clearRect(0, 0, W, H); t += 0.016;
      for (const s of stars) {
        const tw = reduced ? 1 : 0.55 + 0.45 * Math.sin(t * 1.4 + s.tw);
        cx.beginPath(); cx.arc(s.x, s.y, s.r * s.z * devicePixelRatio, 0, 7);
        cx.fillStyle = s.hue + (0.2 + 0.55 * s.z) * tw + ')'; cx.fill();
      }
      requestAnimationFrame(draw);
    })();
  }

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

/* PWA install chip lives in its own file so the landing page (which does not
   load site.js) can use it too — see assets/install.js */
(() => {
  const s = document.createElement('script');
  s.src = '/assets/install.js';
  s.defer = true;
  document.head.appendChild(s);
})();
