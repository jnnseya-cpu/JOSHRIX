/**
 * App navigation for the installed PWA.
 *
 * The manifest declares display:"standalone", which means once JOSHRIX is
 * installed there is NO address bar and NO browser back button. Any page whose
 * own header does not carry links is therefore a dead end — you can reach it and
 * never leave. Forge Studio was exactly that: its header held the logo and a
 * "Home" link and nothing else, so an installed user who opened Studio had no
 * route to the Arcade, their Wallet, or anywhere.
 *
 * This injects one menu on every page, so the app is navigable no matter which
 * page the user landed on or how their header was built. In standalone it also
 * supplies the Back control the browser is no longer providing.
 *
 * It is additive and defensive: it never rewrites a page's own navigation, and
 * every step is guarded so a missing element can never take the page down with
 * it. A navigation bug should strand you on one screen, not on a blank one.
 */
(function () {
  "use strict";
  if (window.__jxAppNav) return;
  window.__jxAppNav = true;

  var LINKS = [
    ["Create", [
      ["Forge Studio", "/studio"],
      ["Agent Fleet", "/agent-fleet"],
      ["Worlds", "/worlds"],
      ["Growth Engine", "/growth"],
    ]],
    ["Play", [
      ["Arcade", "/arcade"],
      ["Marketplace", "/marketplace"],
      ["Showcase", "/showcase"],
    ]],
    ["Account", [
      ["Dashboard", "/dashboard"],
      ["Wallet", "/wallet"],
      ["Profile", "/profile"],
      ["Pricing", "/pricing"],
    ]],
    ["Learn", [
      ["How It Works", "/how-it-works"],
      ["Docs", "/docs"],
      ["Blog", "/blog"],
      ["Home", "/"],
    ]],
  ];

  /** True when running as an installed app, where no browser chrome exists. */
  function standalone() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
             window.matchMedia("(display-mode: fullscreen)").matches ||
             window.navigator.standalone === true;
    } catch (e) { return false; }
  }

  var here = (location.pathname || "/").replace(/\.html$/, "").replace(/\/$/, "") || "/";

  var css = [
    ".jx-navbtn{position:fixed;top:12px;right:12px;z-index:9998;width:44px;height:44px;",
    "display:flex;align-items:center;justify-content:center;border-radius:12px;cursor:pointer;",
    "background:rgba(10,10,18,.72);border:1px solid rgba(255,255,255,.18);color:#fff;",
    "backdrop-filter:blur(8px);font-size:19px;line-height:1;padding:0}",
    ".jx-navbtn:focus-visible{outline:2px solid #22D3EE;outline-offset:2px}",
    ".jx-navwrap{position:fixed;inset:0;z-index:9999;display:none}",
    ".jx-navwrap[data-open='1']{display:block}",
    ".jx-navscrim{position:absolute;inset:0;background:rgba(3,3,8,.62);backdrop-filter:blur(3px)}",
    ".jx-navpanel{position:absolute;top:0;right:0;bottom:0;width:min(320px,86vw);overflow-y:auto;",
    "background:#0b0b14;border-left:1px solid rgba(255,255,255,.12);padding:16px 14px 28px;",
    "box-shadow:-18px 0 48px rgba(0,0,0,.5)}",
    ".jx-navhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}",
    ".jx-navhead b{color:#fff;font-size:14px;letter-spacing:.14em;text-transform:uppercase}",
    ".jx-navclose{background:none;border:0;color:#9d9db3;font-size:26px;cursor:pointer;padding:4px 8px;line-height:1}",
    ".jx-navback{display:block;width:100%;text-align:left;margin:8px 0 4px;padding:11px 12px;border-radius:10px;",
    "background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:15px;cursor:pointer}",
    ".jx-navgrp{margin-top:14px;color:#7c7c92;font-size:11px;letter-spacing:.16em;text-transform:uppercase}",
    ".jx-navpanel a{display:block;padding:11px 12px;margin-top:4px;border-radius:10px;color:#e7e7f2;",
    "text-decoration:none;font-size:15px;border:1px solid transparent}",
    ".jx-navpanel a:hover{background:rgba(255,255,255,.07)}",
    ".jx-navpanel a[aria-current='page']{background:rgba(124,58,237,.22);border-color:rgba(124,58,237,.5);color:#fff}",
  ].join("");

  function build() {
    if (!document.body) return;

    var style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);

    var btn = document.createElement("button");
    btn.className = "jx-navbtn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "&#9776;";

    var wrap = document.createElement("div");
    wrap.className = "jx-navwrap";
    wrap.setAttribute("data-open", "0");

    var scrim = document.createElement("div");
    scrim.className = "jx-navscrim";

    var panel = document.createElement("div");
    panel.className = "jx-navpanel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Menu");

    var head = document.createElement("div");
    head.className = "jx-navhead";
    var title = document.createElement("b");
    title.textContent = "JOSHRIX";
    var close = document.createElement("button");
    close.className = "jx-navclose";
    close.type = "button";
    close.setAttribute("aria-label", "Close menu");
    close.innerHTML = "&times;";
    head.appendChild(title);
    head.appendChild(close);
    panel.appendChild(head);

    // In the installed app there is no browser back button, so supply one —
    // but only when there is somewhere to go back TO.
    if (standalone() && history.length > 1) {
      var back = document.createElement("button");
      back.className = "jx-navback";
      back.type = "button";
      back.innerHTML = "&larr; Back";
      back.addEventListener("click", function () { history.back(); });
      panel.appendChild(back);
    }

    LINKS.forEach(function (group) {
      var h = document.createElement("div");
      h.className = "jx-navgrp";
      h.textContent = group[0];
      panel.appendChild(h);
      group[1].forEach(function (item) {
        var a = document.createElement("a");
        a.href = item[1];
        a.textContent = item[0];
        if (item[1].replace(/\/$/, "") === here || (item[1] === "/" && here === "/")) {
          a.setAttribute("aria-current", "page");
        }
        panel.appendChild(a);
      });
    });

    wrap.appendChild(scrim);
    wrap.appendChild(panel);
    document.body.appendChild(btn);
    document.body.appendChild(wrap);

    function open(on) {
      wrap.setAttribute("data-open", on ? "1" : "0");
      btn.setAttribute("aria-expanded", on ? "true" : "false");
      if (on) { var f = panel.querySelector("a"); if (f) f.focus(); } else { btn.focus(); }
    }
    btn.addEventListener("click", function () { open(wrap.getAttribute("data-open") !== "1"); });
    close.addEventListener("click", function () { open(false); });
    scrim.addEventListener("click", function () { open(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && wrap.getAttribute("data-open") === "1") open(false);
    });
  }

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { try { build(); } catch (e) {} });
    } else {
      build();
    }
  } catch (e) { /* navigation must never break the page it sits on */ }
})();
