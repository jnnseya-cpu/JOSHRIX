/* JOSHRIX human gate — only humans sign up or log in.
   Layered client checks that stop scripted form abuse cold:
   1. honeypot — an invisible "website" field humans never fill, bots do
   2. timing — humans can't complete the form in under 3 seconds
   3. presence — real pointer/keyboard/touch interaction must have occurred
   (Production hardening beyond this — Cloudflare Turnstile — drops in with a
   site key; Firebase also rate-limits credential abuse server-side.) */
(() => {
  if (window.jxHumanCheck) return;
  const t0 = Date.now();
  let interacted = false;
  const mark = () => { interacted = true; };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => addEventListener(ev, mark, { once: true, passive: true }));

  const arm = () => {
    document.querySelectorAll('form.form').forEach((form) => {
      if (form.querySelector('input[name="website"]')) return;
      const hp = document.createElement('input');
      hp.type = 'text';
      hp.name = 'website';                     // bait: bots auto-fill named fields
      hp.autocomplete = 'off';
      hp.tabIndex = -1;
      hp.setAttribute('aria-hidden', 'true');
      hp.style.cssText = 'position:absolute;left:-9999px;top:auto;height:1px;width:1px;opacity:0';
      form.appendChild(hp);
    });
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', arm); else arm();

  window.jxHumanCheck = (form) => {
    const hp = form && form.querySelector('input[name="website"]');
    if (hp && hp.value) return { ok: false, reason: 'Automated submission detected.' };
    if (Date.now() - t0 < 3000) return { ok: false, reason: 'That was too fast — please take a moment and try again.' };
    if (!interacted) return { ok: false, reason: 'Please use the form directly.' };
    return { ok: true };
  };
})();
