/**
 * One cookieless pageview beacon per page load.
 *
 * No cookies, no localStorage, no third-party script, nothing to consent to.
 * It reports the path and the referrer, and the server keeps only the
 * referrer's HOST. Every failure is swallowed: a counter that can break the
 * page it counts is worse than no counter.
 */
(function () {
  "use strict";
  if (window.__jxTracked) return;
  window.__jxTracked = true;
  try {
    var base = (window.JOSHRIX_API_BASE || "");
    // An email click carries no referrer, so a campaign would be indistinguishable
    // from direct traffic. ?ref= names the source explicitly and takes precedence;
    // the server still keeps only a host-shaped token, never a full URL.
    var tagged = (location.search.match(/[?&]ref=([A-Za-z0-9_.-]{1,32})/) || [])[1];
    var body = JSON.stringify({
      path: location.pathname,
      ref: tagged ? tagged + ".campaign" : (document.referrer || ""),
    });
    // keepalive so the beacon survives a click that navigates away immediately
    fetch(base + "/api/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: body, keepalive: true,
    }).catch(function () {});
  } catch (e) {}
})();
