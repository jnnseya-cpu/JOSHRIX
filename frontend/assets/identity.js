/* JOSHRIX nav identity — site-wide. If this device has a signed-in profile
   (jx.profile), every page shows the identity chip and REMOVES the
   Sign In / Sign Up buttons; signed-out visitors keep them. */
(() => {
  if (window.__jxIdentity) return;
  window.__jxIdentity = 1;

  const run = () => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('jx.profile') || '{}'); } catch (e) { return; }
    if (!(p.displayName || p.avatar || p.handle)) return;
    const nav = document.querySelector('.nav-right');
    if (!nav) return;
    nav.querySelectorAll('a[href$="login.html"], a[href$="signup.html"]').forEach((el) => el.remove());
    if (document.querySelector('.jx-nav-name')) return;   // store.js already drew the chip
    const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
    const a = document.createElement('a');
    a.href = 'profile.html';
    a.title = 'Your profile';
    a.style.cssText = 'display:flex;align-items:center;gap:.5rem;text-decoration:none;color:var(--text,#ececf4);font-weight:600;font-size:.9rem';
    const face = p.avatar
      ? '<img src="' + p.avatar + '" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--stroke-bright,#3b3b52)">'
      : '<span style="width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7C3AED,#22D3EE);color:#fff;font-weight:700">' + esc(((p.displayName || p.handle || 'J')[0] || 'J').toUpperCase()) + '</span>';
    a.innerHTML = face + '<span class="jx-nav-name">' + esc(p.displayName || p.handle || '') + '</span>';
    nav.insertBefore(a, nav.firstChild);
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', run);
  else run();
})();
