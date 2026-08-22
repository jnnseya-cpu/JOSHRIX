/**
 * The consent banner for the advertising tags.
 *
 * It renders ONLY when pixels.js has set data-jx-consent-pending, which happens
 * only when an ad ID is actually configured and the visitor has not already
 * chosen. So a deploy with no Pixel ID shows nobody a banner about nothing, and
 * a returning visitor is never asked twice.
 *
 * Deliberately not a "we value your privacy" modal with a hidden reject link:
 * under UK PECR refusing has to be as easy as accepting, and the platform sells
 * to schools. Accept and Decline are the same size, the same distance from the
 * pointer, and Decline needs no second click.
 *
 * The first-party beacon is not mentioned because it is not what consent is
 * for — it sets nothing on the device and keeps only a referrer host.
 */
(function (w, d) {
  "use strict";
  function build() {
    if (!d.documentElement.hasAttribute("data-jx-consent-pending")) return;
    if (d.getElementById("jx-consent")) return;

    var wrap = d.createElement("div");
    wrap.id = "jx-consent";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-live", "polite");
    wrap.setAttribute("aria-label", "Cookie choices");
    wrap.innerHTML =
      '<p>We\'d like to use Meta and Google advertising cookies to see which ads bring ' +
      'creators here. Nothing loads until you choose, and declining changes nothing about ' +
      'the site. <a href="/privacy">How we handle data</a>.</p>' +
      '<div class="jx-consent-btns">' +
      '<button type="button" data-c="denied">Decline</button>' +
      '<button type="button" data-c="granted" class="ok">Accept</button>' +
      "</div>";

    var css = d.createElement("style");
    css.textContent =
      "#jx-consent{position:fixed;left:50%;transform:translateX(-50%);bottom:14px;z-index:9999;" +
      "width:min(680px,calc(100vw - 24px));display:flex;flex-wrap:wrap;gap:.9rem;align-items:center;" +
      "justify-content:space-between;background:rgba(11,11,20,.96);color:#F4F4FA;" +
      "border:1px solid rgba(160,140,255,.35);border-radius:14px;padding:.9rem 1.1rem;" +
      "box-shadow:0 20px 50px rgba(0,0,0,.55);backdrop-filter:blur(10px);" +
      "font-family:'Rajdhani',system-ui,'Segoe UI',sans-serif;font-size:.95rem;line-height:1.5}" +
      "#jx-consent p{margin:0;flex:1 1 300px;min-width:0}" +
      "#jx-consent a{color:#22D3EE}" +
      "#jx-consent .jx-consent-btns{display:flex;gap:.5rem;flex:0 0 auto}" +
      "#jx-consent button{font:inherit;font-weight:700;cursor:pointer;border-radius:999px;" +
      "padding:.55rem 1.2rem;border:1px solid rgba(160,140,255,.45);background:transparent;color:#F4F4FA}" +
      "#jx-consent button.ok{background:linear-gradient(90deg,#7C3AED,#22D3EE);border-color:transparent;color:#fff}" +
      "#jx-consent button:focus-visible{outline:2px solid #22D3EE;outline-offset:2px}" +
      "@media(max-width:520px){#jx-consent .jx-consent-btns{width:100%}" +
      "#jx-consent button{flex:1}}";

    wrap.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button[data-c]") : null;
      if (!b) return;
      try { w.JX.consent(b.getAttribute("data-c")); } catch (err) {}
      wrap.remove();
    });

    d.head.appendChild(css);
    d.body.appendChild(wrap);
  }
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", build);
  else build();
})(window, document);
