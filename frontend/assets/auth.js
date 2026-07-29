/**
 * JOSHRIX auth layer — Firebase Authentication (email/password + Google).
 * Activates when window.JOSHRIX_FIREBASE_CONFIG is set in assets/config.js
 * (the Firebase WEB config is public by design — security lives in rules).
 * Until configured, signup/login stay in demo mode with a clear notice.
 */
(function () {
  // ?test=1 → tester mode: skip Firebase entirely, accounts live on this device.
  // The flag persists for the session so navigation keeps you in test mode.
  try {
    if (new URLSearchParams(location.search).has('test')) sessionStorage.setItem('jx.testMode', '1');
    if (sessionStorage.getItem('jx.testMode') === '1') { window.jxAuth = { enabled: false, testMode: true, ready: null }; return; }
  } catch (e) { /* private browsing */ }
  const cfg = window.JOSHRIX_FIREBASE_CONFIG;
  window.jxAuth = { enabled: !!(cfg && cfg.apiKey), ready: null };
  if (!window.jxAuth.enabled) return;

  const load = (src) => new Promise((ok, err) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = err;
    document.head.appendChild(s);
  });

  window.jxAuth.ready = (async () => {
    await load('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
    await load('https://www.gstatic.com/firebasejs/12.9.0/firebase-auth-compat.js');
    firebase.initializeApp(cfg);
    const auth = firebase.auth();
    return {
      auth,
      signUp: (email, pass, displayName) =>
        auth.createUserWithEmailAndPassword(email, pass)
          .then((c) => displayName ? c.user.updateProfile({ displayName }).then(() => c.user) : c.user),
      signIn: (email, pass) => auth.signInWithEmailAndPassword(email, pass).then((c) => c.user),
      signInGoogle: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).then((c) => c.user),
      resetPassword: (email) => auth.sendPasswordResetEmail(email),
      signOut: () => auth.signOut(),
      onUser: (cb) => auth.onAuthStateChanged(cb),
      idToken: () => auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null),
    };
  })();
})();
