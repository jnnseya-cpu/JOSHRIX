/**
 * Client half of the human check for account creation.
 *
 * window.joshrixHuman(apiBase) resolves to the object that /api/wallet-init
 * expects as `human`, or null when verification is switched off for this
 * deployment. It is deliberately impossible for this to block a signup on its
 * own: every failure path returns null and the server falls back to its rate
 * limits, because a verification widget that breaks and locks people out is a
 * worse outage than the abuse it prevents.
 *
 * The proof of work itself is served by the API so the algorithm has exactly
 * one definition. Solving costs about a second of CPU — unnoticeable once,
 * ruinous ten thousand times, which is the entire point.
 */
(function () {
  "use strict";

  var pageLoadedAt = Date.now();
  var solverPromise = null;

  function loadSolver(base) {
    if (solverPromise) return solverPromise;
    solverPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = base + "/api/human-challenge?js=1";
      s.onload = function () { window.joshrixSolve ? resolve(window.joshrixSolve) : reject(new Error("solver missing")); };
      s.onerror = function () { reject(new Error("solver failed to load")); };
      document.head.appendChild(s);
    });
    return solverPromise;
  }

  window.joshrixHuman = async function (apiBase, onProgress) {
    var base = apiBase || "";
    try {
      var r = await fetch(base + "/api/human-challenge", { signal: AbortSignal.timeout(10000) });
      var j = await r.json();
      if (!j || !j.configured || !j.challenge) return null;   // not enabled here

      var solve = await loadSolver(base);
      var solution = await solve(j.challenge, onProgress);

      return {
        nonce: j.challenge.nonce,
        issued: j.challenge.issued,
        difficulty: j.challenge.difficulty,
        sig: j.challenge.sig,
        solution: solution,
        elapsedMs: Date.now() - pageLoadedAt,
        website: "",                 // the honeypot: a person never fills this
      };
    } catch (e) {
      return null;
    }
  };
})();
