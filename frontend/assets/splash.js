/* ------------------------------ launch screens --------------------------
 * Android composes its launch screen from the manifest (background_color +
 * the 512px icon), which the manifest already supplies. Safari ignores all of
 * that: without an explicit <link rel="apple-touch-startup-image"> matching
 * the exact device, an installed PWA opens on a BLANK WHITE SCREEN until the
 * page paints — the worst possible first impression for an app sold as
 * premium, and the one thing a user sees before anything else.
 *
 * This is the ONE place the device table lives. It is a separate file rather
 * than part of appnav.js because a forged game page carries no navigation but
 * is still installable — and a shared game link is the most likely place
 * somebody taps "Add to Home Screen". Safari reads the document at that
 * moment, by which point this has run.
 *
 * The table is device-independent-pixels in PORTRAIT, exactly as iOS reports
 * device-width/device-height in media queries no matter how the device is
 * held. Landscape therefore keeps the same two numbers and only flips
 * `orientation`; it is the IMAGE that is rotated. tools/make-splash.mjs
 * generates the files from this same table, and tests/t19-splash.js fails if
 * the two ever drift apart.
 */
(function () {
  "use strict";
  if (window.__jxSplash) return;
  window.__jxSplash = true;
  function splash() {
    if (document.querySelector('link[rel="apple-touch-startup-image"]')) return;
    var D = [
      [320, 568, 2, "iphone-se1"], [375, 667, 2, "iphone-8"], [414, 736, 3, "iphone-8-plus"],
      [375, 812, 3, "iphone-x"], [414, 896, 2, "iphone-xr"], [414, 896, 3, "iphone-xs-max"],
      [390, 844, 3, "iphone-12"], [428, 926, 3, "iphone-12-pro-max"], [393, 852, 3, "iphone-15"],
      [430, 932, 3, "iphone-15-pro-max"], [402, 874, 3, "iphone-16-pro"], [440, 956, 3, "iphone-16-pro-max"],
      [744, 1133, 2, "ipad-mini"], [810, 1080, 2, "ipad-10"], [834, 1194, 2, "ipad-pro-11"],
      [1024, 1366, 2, "ipad-pro-12"]
    ];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < D.length; i++) {
      for (var o = 0; o < 2; o++) {
        var orient = o ? "landscape" : "portrait";
        var l = document.createElement("link");
        l.rel = "apple-touch-startup-image";
        l.media = "(device-width: " + D[i][0] + "px) and (device-height: " + D[i][1] + "px) and " +
                  "(-webkit-device-pixel-ratio: " + D[i][2] + ") and (orientation: " + orient + ")";
        l.href = "/assets/splash/" + D[i][3] + "-" + orient + ".png";
        frag.appendChild(l);
      }
    }
    (document.head || document.documentElement).appendChild(frag);
  }
  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { try { splash(); } catch (e) {} });
    } else { splash(); }
  } catch (e) { /* a launch image must never break the page it is declared on */ }
})();
