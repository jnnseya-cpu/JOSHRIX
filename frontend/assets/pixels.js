/**
 * Meta Pixel + Google Tag, behind one consent gate and one API.
 *
 *   JX.track("purchase", { value: 19, currency: "GBP", id: "creator" })
 *
 * WHY ONE MODULE AND NOT TWO SNIPPETS PASTED INTO 33 PAGES
 * Every ad platform names the same event differently — Meta wants "Purchase"
 * with a capital P, GA4 wants "purchase" with a value block, and both want a
 * different shape again for a signup. Pasting both snippets everywhere means
 * every new event has to be written twice, in 33 files, and the first time the
 * two drift the reporting silently stops agreeing. So a game sale is ONE call
 * to JX.track and this file decides what each platform is told.
 *
 * WHY CONSENT IS NOT OPTIONAL HERE
 * privacy.html section 6 says "No third-party advertising cookies", and the
 * platform sells to UK schools. Under UK PECR a non-essential tracking cookie
 * needs consent BEFORE it is set, not a banner that appears after the pixel has
 * already fired. So nothing third-party loads until consent is granted: no
 * script tag, no cookie, no network call. Google Consent Mode v2 defaults are
 * set to denied before gtag loads, which is what keeps GA compliant rather than
 * merely quiet.
 *
 * The first-party beacon in track.js is unaffected and always runs. It is
 * cookieless, stores nothing on the device and keeps only a referrer host, so
 * it is not what consent is for — and it means the platform still knows its own
 * traffic when a visitor declines.
 *
 * IDs live in config.js because they are public by design: a Pixel ID and a GA4
 * measurement ID are visible in any page that uses them. They are not secrets
 * and must never be treated as ones. With no ID configured this file does
 * nothing at all and costs one function call.
 */
(function (w, d) {
  "use strict";
  if (w.JX && w.JX.__pixels) return;

  var META = w.JOSHRIX_META_PIXEL_ID || "";
  var GA = w.JOSHRIX_GA_ID || "";
  var KEY = "jx_consent";
  var MAX_QUEUE = 40;

  var queue = [];
  var loaded = false;

  function consent() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }

  /* Canonical event -> what each platform actually wants.
   * Meta's standard events are a fixed vocabulary and anything outside it is a
   * custom event with worse optimisation, so a JOSHRIX event maps onto the
   * closest standard one wherever an honest match exists and stays custom where
   * it does not. Inventing a standard event that misdescribes what happened
   * poisons the ad platform's optimisation, which is worse than a custom one. */
  var MAP = {
    sign_up:        { ga: "sign_up",        meta: "CompleteRegistration" },
    topup:          { ga: "purchase",       meta: "Purchase" },
    subscribe:      { ga: "purchase",       meta: "Subscribe" },
    purchase:       { ga: "purchase",       meta: "Purchase" },
    begin_checkout: { ga: "begin_checkout", meta: "InitiateCheckout" },
    newsletter:     { ga: "generate_lead",  meta: "Lead" },
    view_game:      { ga: "view_item",      meta: "ViewContent" },
    // No standard event describes forging or publishing a game, so these stay
    // custom on both sides rather than being mislabelled as something else.
    forge_start:    { ga: "forge_start",    meta: "ForgeStart",    custom: true },
    forge_complete: { ga: "forge_complete", meta: "ForgeComplete", custom: true },
    publish:        { ga: "publish",        meta: "PublishGame",   custom: true },
    list_game:      { ga: "list_game",      meta: "ListGame",      custom: true },
    play_game:      { ga: "play_game",      meta: "PlayGame",      custom: true },
    enhance:        { ga: "enhance",        meta: "EnhanceGame",   custom: true },
  };

  function inject(src) {
    var s = d.createElement("script");
    s.async = true; s.src = src;
    (d.head || d.documentElement).appendChild(s);
  }

  function loadGoogle() {
    if (!GA) return;
    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
    /* Consent Mode v2. These have to be pushed BEFORE the library loads or the
       first pageview goes out ungoverned, which is the whole failure this is
       meant to prevent. */
    w.gtag("consent", "default", {
      ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied",
      analytics_storage: "denied", wait_for_update: 500,
    });
    w.gtag("consent", "update", {
      ad_storage: "granted", ad_user_data: "granted",
      ad_personalization: "granted", analytics_storage: "granted",
    });
    w.gtag("js", new Date());
    w.gtag("config", GA, { send_page_view: true });
    inject("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA));
  }

  function loadMeta() {
    if (!META) return;
    if (!w.fbq) {
      var n = w.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!w._fbq) w._fbq = n;
      n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      inject("https://connect.facebook.net/en_US/fbevents.js");
    }
    w.fbq("init", META);
    w.fbq("track", "PageView");
  }

  function loadAll() {
    if (loaded) return;
    loaded = true;
    try { loadGoogle(); } catch (e) {}
    try { loadMeta(); } catch (e) {}
    var pending = queue.splice(0, queue.length);
    for (var i = 0; i < pending.length; i++) send(pending[i][0], pending[i][1]);
  }

  function send(name, params) {
    var m = MAP[name] || { ga: name, meta: name, custom: true };
    params = params || {};
    try {
      if (w.gtag) w.gtag("event", m.ga, params);
    } catch (e) {}
    try {
      if (w.fbq) {
        // Meta reads value/currency off the top level and rejects nothing else,
        // so the same params object is safe to pass through unchanged.
        w.fbq(m.custom ? "trackCustom" : "track", m.meta, params);
      }
    } catch (e) {}
  }

  var JX = w.JX = w.JX || {};
  JX.__pixels = true;

  /** Record an event. Safe before consent, safe with no IDs configured, safe
   *  offline, and never throws — a broken counter must not break a checkout. */
  JX.track = function (name, params) {
    try {
      if (!name) return;
      if (consent() === "granted") {
        if (!loaded) loadAll();
        else send(name, params);
      } else if (consent() !== "denied" && queue.length < MAX_QUEUE) {
        // Held, not dropped: a visitor who accepts after clicking Buy should
        // still have that purchase counted. Capped so a long session cannot
        // grow this without bound.
        queue.push([name, params]);
      }
    } catch (e) {}
  };

  /** Called by the consent banner. "granted" loads and flushes; "denied" clears
   *  the queue and guarantees nothing third-party is ever fetched this session. */
  JX.consent = function (choice) {
    try { localStorage.setItem(KEY, choice === "granted" ? "granted" : "denied"); } catch (e) {}
    if (choice === "granted") loadAll();
    else queue.length = 0;
    try { d.documentElement.removeAttribute("data-jx-consent-pending"); } catch (e) {}
  };

  JX.consentState = consent;

  // A returning visitor who already accepted gets the tags on this load too.
  if (consent() === "granted") loadAll();
  else if (consent() !== "denied" && (META || GA)) {
    // Only ask when there is actually something to consent to.
    try { d.documentElement.setAttribute("data-jx-consent-pending", "1"); } catch (e) {}
  }
})(window, document);
