/* JOSHRIX nav identity — site-wide account presence.
   Signed in (jx.profile holds an identity): every page shows the avatar chip
   with an account menu — Profile · Dashboard · Wallet · Sign Out — and the
   Sign In / Sign Up buttons are removed. Signed out: buttons stay. */
(() => {
  if (window.__jxIdentity) return;
  window.__jxIdentity = 1;

  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

  const signOut = async () => {
    try { if (window.jxAuth && window.jxAuth.enabled && window.jxAuth.ready) { const a = await window.jxAuth.ready; await a.signOut(); } } catch (e) {}
    try { localStorage.removeItem('jx.profile'); } catch (e) {}
    try { sessionStorage.removeItem('jx.modKey'); } catch (e) {}
    location.href = 'index.html';
  };

  const run = () => {
    let p = {};
    try { p = JSON.parse(localStorage.getItem('jx.profile') || '{}'); } catch (e) { return; }
    if (!(p.displayName || p.avatar || p.handle)) return;
    const nav = document.querySelector('.nav-right');
    if (!nav) return;
    nav.querySelectorAll('a[href$="login.html"], a[href$="signup.html"]').forEach((el) => el.remove());
    if (document.querySelector('.jx-nav-name')) return;   // another script already drew it

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;align-items:center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Your account';
    btn.setAttribute('aria-haspopup', 'true');
    btn.style.cssText = 'display:flex;align-items:center;gap:.5rem;background:none;border:0;cursor:pointer;color:var(--text,#ececf4);font-weight:600;font-size:.9rem;font-family:inherit;padding:.2rem .3rem';
    const face = p.avatar
      ? '<img src="' + p.avatar + '" alt="" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:1px solid var(--stroke-bright,#3b3b52)">'
      : '<span style="width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#7C3AED,#22D3EE);color:#fff;font-weight:700">' + esc(((p.displayName || p.handle || 'J')[0] || 'J').toUpperCase()) + '</span>';
    btn.innerHTML = face + '<span class="jx-nav-name">' + esc(p.displayName || p.handle || '') + '</span><span aria-hidden="true" style="font-size:.65rem;opacity:.7">▾</span>';

    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'position:absolute;top:calc(100% + 10px);right:0;min-width:190px;background:#0b0b14;border:1px solid rgba(124,58,237,.5);border-radius:12px;padding:.45rem;box-shadow:0 14px 44px rgba(0,0,0,.55);display:none;z-index:9999';
    const item = (icon, label, action) => {
      const a = document.createElement(typeof action === 'string' ? 'a' : 'button');
      if (typeof action === 'string') a.href = action; else { a.type = 'button'; a.addEventListener('click', action); }
      a.style.cssText = 'display:flex;align-items:center;gap:.6rem;width:100%;text-align:left;background:none;border:0;cursor:pointer;color:#ececf4;font:600 .88rem/1 inherit;font-family:inherit;padding:.6rem .7rem;border-radius:8px;text-decoration:none';
      a.addEventListener('mouseenter', () => { a.style.background = 'rgba(124,58,237,.18)'; });
      a.addEventListener('mouseleave', () => { a.style.background = 'none'; });
      a.innerHTML = '<span aria-hidden="true">' + icon + '</span>' + label;
      return a;
    };
    menu.append(
      item('👤', 'Profile', 'profile.html'),
      item('📊', 'Dashboard', 'dashboard.html'),
      item('💳', 'Wallet', 'wallet.html'),
      item('🚪', 'Sign Out', signOut)
    );

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    addEventListener('click', () => { menu.style.display = 'none'; });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') menu.style.display = 'none'; });

    wrap.append(btn, menu);
    nav.insertBefore(wrap, nav.firstChild);
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', run);
  else run();
})();
