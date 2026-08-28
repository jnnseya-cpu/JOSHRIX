/**
 * JOSHRIX auth layer — Firebase Authentication (email/password + Google).
 * Activates when window.JOSHRIX_FIREBASE_CONFIG is set in assets/config.js
 * (the Firebase WEB config is public by design — security lives in rules).
 * Until configured, signup/login stay in demo mode with a clear notice.
 *
 * Google sign-in: popups are blocked or broken on most mobile browsers and in
 * the installed PWA, so phones/tablets use a FULL-PAGE REDIRECT instead; the
 * result is completed on return via getRedirectResult. Desktop keeps the popup
 * and falls back to redirect automatically if the popup is blocked.
 */
/**
 * The server now verifies identity, so every call that reaches a wallet must
 * carry the Firebase ID token. This helper is defined FIRST, outside the
 * configuration and test-mode early returns below, because those paths still
 * make API calls and the helper must exist (returning {}) rather than throw.
 *
 * Always await it at call time, never cache the header: Firebase ID tokens
 * expire after an hour and getIdToken() silently refreshes them.
 */
window.jxAuthHeaders = async function () {
  try {
    var a = window.jxAuth;
    if (a && typeof a.idToken === 'function') {
      var t = await a.idToken();
      if (t) return { Authorization: 'Bearer ' + t };
    }
  } catch (e) { /* signed out, offline, or Firebase not configured */ }
  return {};
};

(function () {
  // ?test=1 → tester mode: skip Firebase entirely, accounts live on this device.
  // The flag persists for the session so navigation keeps you in test mode.
  try {
    if (new URLSearchParams(location.search).has('test')) sessionStorage.setItem('jx.testMode', '1');
    if (sessionStorage.getItem('jx.testMode') === '1') { window.jxAuth = { enabled: false, testMode: true, ready: null }; return; }
  } catch (e) { /* private browsing */ }
  const cfg = window.JOSHRIX_FIREBASE_CONFIG;
  window.jxAuth = { enabled: !!(cfg && cfg.apiKey), ready: null, redirectError: null };
  if (!window.jxAuth.enabled) return;

  // Human-readable messages for the codes real users actually hit.
  window.jxAuth.friendly = (err) => {
    const code = (err && err.code) || '';
    if (/invalid-credential|wrong-password|user-not-found|invalid-login-credentials/.test(code))
      return 'Email or password is incorrect — or no account exists for this email yet. Check for typos, use “Reset link via email”, or create an account.';
    if (/email-already-in-use/.test(code)) return 'An account already exists for this email — sign in instead, or reset your password.';
    if (/invalid-email/.test(code)) return 'That email address doesn’t look right — check it and try again.';
    if (/weak-password/.test(code)) return 'Password too weak — use at least 6 characters.';
    if (/too-many-requests/.test(code)) return 'Too many attempts — wait a minute and try again, or reset your password.';
    if (/network-request-failed/.test(code)) return 'Network problem — check your connection and try again.';
    if (/unauthorized-domain/.test(code)) return 'Google sign-in isn’t authorised for this domain yet — use email sign-in for now.';
    if (/operation-not-allowed/.test(code)) return 'This sign-in method isn’t enabled yet — use email sign-in for now.';
    if (/popup-blocked|popup-closed-by-user|cancelled-popup-request/.test(code))
      return 'The sign-in window was blocked or closed — tap the Google button again to retry.';
    if (/account-exists-with-different-credential/.test(code))
      return 'This email already has a password account — sign in with email and password instead.';
    return (err && err.message) || 'Sign-in failed — please try again.';
  };

  const load = (src) => new Promise((ok, err) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err;
    document.head.appendChild(s);
  });

  // Phones, tablets, and the installed PWA can't do popup sign-in reliably.
  const needsRedirect = () => {
    try {
      if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) return true;
    } catch (e) {}
    return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)); // iPadOS masquerades as Mac
  };

  const rememberUser = (u) => {
    try {
      const p = JSON.parse(localStorage.getItem('jx.profile') || '{}');
      p.displayName = p.displayName || (u && u.displayName) || ((u && u.email) || '').split('@')[0] || 'Operator';
      p.email = p.email || (u && u.email) || '';
      localStorage.setItem('jx.profile', JSON.stringify(p));
    } catch (e) {}
  };

  window.jxAuth.ready = (async () => {
    await load('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
    await load('https://www.gstatic.com/firebasejs/12.9.0/firebase-auth-compat.js');
    firebase.initializeApp(cfg);
    const auth = firebase.auth();

    // Complete a Google sign-in that came back via full-page redirect: finish
    // the profile and land the user in the dashboard they were headed to.
    try {
      const came = sessionStorage.getItem('jx.gredirect') === '1';
      const c = await auth.getRedirectResult();
      if (c && c.user) {
        sessionStorage.removeItem('jx.gredirect');
        rememberUser(c.user);
        if (/login|signup/i.test(location.pathname)) {
          let nx = 'dashboard.html';
          try { const t = sessionStorage.getItem('jx.next'); if (t && /^[a-z0-9-]+\.html$/i.test(t)) nx = t; } catch (e) {}
          location.href = nx;
        }
      } else if (came) {
        sessionStorage.removeItem('jx.gredirect');
      }
    } catch (e) {
      sessionStorage.removeItem('jx.gredirect');
      window.jxAuth.redirectError = e;   // pages surface this with friendly()
    }

    const googleRedirect = (provider) => {
      try { sessionStorage.setItem('jx.gredirect', '1'); } catch (e) {}
      // navigation away — return a never-resolving promise so callers don't
      // race the redirect with their own navigation
      return auth.signInWithRedirect(provider).then(() => new Promise(() => {}));
    };

    return {
      auth,
      signUp: (email, pass, displayName) =>
        auth.createUserWithEmailAndPassword(email, pass)
          .then((c) => displayName ? c.user.updateProfile({ displayName }).then(() => c.user) : c.user),
      signIn: (email, pass) => auth.signInWithEmailAndPassword(email, pass).then((c) => c.user),
      signInGoogle: () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        if (needsRedirect()) return googleRedirect(provider);
        return auth.signInWithPopup(provider).then((c) => c.user).catch((err) => {
          const code = (err && err.code) || '';
          if (/popup-blocked|operation-not-supported|cancelled-popup-request|web-storage-unsupported/.test(code)) {
            return googleRedirect(provider);   // popup impossible here — go full page
          }
          throw err;
        });
      },
      resetPassword: (email) => auth.sendPasswordResetEmail(email),
      signOut: () => auth.signOut(),
      onUser: (cb) => auth.onAuthStateChanged(cb),
      idToken: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null),
    };
  })();
})();
