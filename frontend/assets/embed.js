/**
 * JOSHRIX Embed SDK — one script tag embeds a certified JOSHRIX game anywhere.
 * (docs/DEEP-DIVE.md §1.5 — distribution without portals.)
 *
 * Usage on any website:
 *   <script src="https://joshrix.com/assets/embed.js"
 *           data-game="penalty-king-3d" data-width="100%" data-ratio="0.6"></script>
 *
 * Every embed carries the "Forge your own" chip — every player is one tap
 * from becoming a creator (the cold-start loop, DEEP-DIVE §3.1).
 */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var game = s.getAttribute('data-game') || 'penalty-king-3d';
  var base = (s.getAttribute('data-base') || (s.src ? s.src.replace(/\/assets\/embed\.js.*$/, '') : '')) || '';
  var width = s.getAttribute('data-width') || '100%';
  var ratio = parseFloat(s.getAttribute('data-ratio') || '0.6');

  // game id → page (v1 static map; production resolves via /play/<id>)
  var src = base + (game === 'penalty-king-3d' ? '/play3d.html' : '/play/' + encodeURIComponent(game));

  var wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:' + width + ';max-width:100%;border-radius:14px;overflow:hidden;' +
    'background:#050508;border:1px solid rgba(160,140,255,.35);box-shadow:0 20px 50px rgba(0,0,0,.45)';

  var pad = document.createElement('div');
  pad.style.cssText = 'width:100%;padding-top:' + (ratio * 100) + '%;position:relative';

  var frame = document.createElement('iframe');
  frame.src = src;
  frame.title = 'JOSHRIX game: ' + game;
  frame.allow = 'autoplay; fullscreen';
  frame.loading = 'lazy';
  frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';

  var chip = document.createElement('a');
  chip.href = base + '/studio.html';
  chip.target = '_blank';
  chip.rel = 'noopener';
  chip.textContent = '⚡ FORGE YOUR OWN · JOSHRIX';
  chip.style.cssText = 'position:absolute;right:.7rem;bottom:.7rem;z-index:2;text-decoration:none;color:#fff;' +
    'font:700 10px/1 system-ui,sans-serif;letter-spacing:.14em;padding:.55rem .9rem;border-radius:999px;' +
    'background:linear-gradient(90deg,#7C3AED,#22D3EE);box-shadow:0 0 16px rgba(124,58,237,.6)';

  pad.appendChild(frame);
  wrap.appendChild(pad);
  wrap.appendChild(chip);
  s.parentNode.insertBefore(wrap, s.nextSibling);

  // Forge Graph: embeds report themselves (fire-and-forget, never blocks the host page)
  try {
    var api = (window.JOSHRIX_API_BASE || base || '') + '/api/telemetry';
    var payload = JSON.stringify({ events: [{ event: 'share.embed_loaded', ts: Date.now(),
      sessionId: 'emb-' + Math.random().toString(36).slice(2, 12), gameId: game,
      props: { host: location.hostname } }] });
    if (navigator.sendBeacon) navigator.sendBeacon(api, new Blob([payload], { type: 'application/json' }));
    else fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
  } catch (e) { /* telemetry must never break a host page */ }
})();
