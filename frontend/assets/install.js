/* JOSHRIX PWA install chip — browsers rarely volunteer the install prompt, so we do.
   Android/Chrome: captures beforeinstallprompt and fires the native dialog.
   iPad/iPhone: Safari has NO auto-prompt ever, so the chip shows the manual
   Add-to-Home-Screen steps instead. Hidden once installed or dismissed. */
(() => {
  if (window.__jxInstall) return;   // idempotent — safe if a page loads this twice
  window.__jxInstall = 1;

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;                                    // already installed
  let hidden = false;
  try { hidden = localStorage.getItem('jx.installHidden') === '1'; } catch (e) {}
  if (hidden) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);  // iPadOS reports as Mac
  let deferredPrompt = null;
  let chip = null;

  const makeChip = (onClick) => {
    if (chip) return;
    chip = document.createElement('div');
    chip.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;align-items:center;gap:.45rem;'
      + 'background:linear-gradient(120deg,rgba(217,45,63,.92),rgba(217,45,63,.85));color:#fff;'
      + 'border-radius:999px;padding:.55rem .5rem .55rem 1rem;font:600 .85rem/1 system-ui,sans-serif;'
      + 'box-shadow:0 8px 30px rgba(0,0,0,.45);cursor:pointer;user-select:none';
    const label = document.createElement('span');
    label.textContent = '⬇ Install App';
    label.addEventListener('click', onClick);
    const x = document.createElement('span');
    x.textContent = '✕';
    x.setAttribute('aria-label', 'Dismiss install prompt');
    x.style.cssText = 'padding:.3rem .55rem;opacity:.8;border-left:1px solid rgba(255,255,255,.35);margin-left:.15rem';
    x.addEventListener('click', (e) => {
      e.stopPropagation();
      chip.remove(); chip = null;
      try { localStorage.setItem('jx.installHidden', '1'); } catch (err) {}
    });
    chip.append(label, x);
    document.body.appendChild(chip);
  };

  const iosSteps = () => {
    const old = document.getElementById('jxIosSteps');
    if (old) { old.remove(); return; }
    const card = document.createElement('div');
    card.id = 'jxIosSteps';
    card.style.cssText = 'position:fixed;right:14px;bottom:66px;z-index:9999;max-width:280px;'
      + 'background:#0F1117;color:#ececf4;border:1px solid rgba(217,45,63,.6);border-radius:14px;'
      + 'padding:1rem 1.1rem;font:400 .88rem/1.55 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.55)';
    card.innerHTML = '<b>Install JOSHRIX on this device</b><br>'
      + '1. Tap the <b>Share</b> button <span style="opacity:.8">(the square with the ↑ arrow)</span><br>'
      + '2. Scroll down and tap <b>Add to Home Screen</b><br>'
      + '3. Tap <b>Add</b> — JOSHRIX opens full-screen like an app';
    document.body.appendChild(card);
  };

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();                       // stop Chrome's mini-infobar; we present it ourselves
    deferredPrompt = e;
    makeChip(async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (choice && choice.outcome === 'accepted' && chip) { chip.remove(); chip = null; }
    });
  });

  addEventListener('appinstalled', () => {
    if (chip) { chip.remove(); chip = null; }
    try { localStorage.setItem('jx.installHidden', '1'); } catch (e) {}
  });

  const iosArm = () => makeChip(iosSteps);
  if (isIOS) {
    if (document.readyState === 'complete') iosArm();
    else addEventListener('load', iosArm);
  }
})();
