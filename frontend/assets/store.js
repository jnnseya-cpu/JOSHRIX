/**
 * JOSHRIX account store — profile, pictures, account type. Autosaves everything.
 * Always persists to localStorage instantly; when Firebase is configured and the
 * user is signed in, the same profile syncs to Firestore (users/{uid}) with a
 * debounce — one store, offline-first, cloud-backed.
 */
(function () {
  const KEY = 'jx.profile';
  const DEFAULTS = {
    accountType: 'creator',   // creator | studio | business | enterprise | education | buyer | admin
    handle: '', displayName: '', email: '', bio: '',
    country: 'United Kingdom', language: 'en', website: '',
    avatar: '', cover: '', createdAt: 0,
    acu: 0, acuCategory: '', testerAcuGranted: false,
  };
  let state = { ...DEFAULTS };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh */ }

  const listeners = [];
  let saveTimer = null, statusCb = null;
  const notify = (s) => { if (statusCb) statusCb(s); };
  const persistLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota */ } };

  async function firestore() {
    if (!window.jxAuth || !window.jxAuth.enabled) return null;
    const a = await window.jxAuth.ready;
    if (!a.auth.currentUser) return null;
    if (!window.firebase.firestore) {
      await new Promise((ok, err) => {
        const s = document.createElement('script');
        s.src = 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore-compat.js';
        s.onload = ok; s.onerror = err; document.head.appendChild(s);
      });
    }
    return { db: window.firebase.firestore(), uid: a.auth.currentUser.uid };
  }

  async function syncDown() {
    try {
      const f = await firestore(); if (!f) return;
      const doc = await f.db.collection('users').doc(f.uid).get();
      if (doc.exists) { Object.assign(state, doc.data()); persistLocal(); listeners.forEach((l) => l(state)); notify('saved'); }
    } catch (e) { /* offline is fine */ }
  }

  function save(patch) {
    Object.assign(state, patch);
    if (!state.createdAt) state.createdAt = Date.now();
    persistLocal();
    notify('saving');
    listeners.forEach((l) => l(state));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const f = await firestore();
        if (f) await f.db.collection('users').doc(f.uid).set(state, { merge: true });
        notify('saved');
      } catch (e) { notify('local'); }
    }, 700);
  }

  /** Pick, crop-to-cover, compress and autosave a picture. kind: 'avatar' | 'cover' */
  function pickImage(kind, cb) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files && input.files[0]; if (!file) return;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        if (kind === 'avatar') { cv.width = 256; cv.height = 256; } else { cv.width = 1600; cv.height = 600; }
        const cx = cv.getContext('2d');
        const scale = Math.max(cv.width / img.width, cv.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        cx.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
        const url = cv.toDataURL('image/jpeg', 0.82);
        URL.revokeObjectURL(img.src);
        const patch = {}; patch[kind] = url;
        save(patch);
        if (cb) cb(url);
      };
      img.src = URL.createObjectURL(file);
    };
    input.click();
  }

  window.jxStore = {
    get: () => ({ ...state }),
    save, pickImage, syncDown,
    onChange: (cb) => { listeners.push(cb); },
    onStatus: (cb) => { statusCb = cb; },
  };

  // OFFLINE DEMO ONLY. Device test-mode shows a simulated 2,000 ACUs so the UI
  // can be walked through without a backend. It is never granted once a real
  // server wallet exists: the server is the only thing that can fund an account
  // (No-Free-AI rule), and painting a balance it would refuse is worse than
  // showing zero — the forge would 402 a second later.
  try {
    if (sessionStorage.getItem('jx.testMode') === '1' && !state.testerAcuGranted && !state.serverWalletId) {
      state.acu = (state.acu || 0) + 2000;
      state.acuCategory = 'tester';
      state.testerAcuGranted = true;
      persistLocal();
    }
  } catch (e) { /* private browsing */ }

  // pull the cloud copy when a signed-in user lands
  if (window.jxAuth && window.jxAuth.enabled && window.jxAuth.ready) {
    window.jxAuth.ready.then((a) => a.onUser((u) => {
      if (u) { if (!state.email) state.email = u.email || ''; if (!state.displayName) state.displayName = u.displayName || ''; syncDown(); }
    })).catch(() => {});
  }

  // nav identity chip + account menu is rendered site-wide by assets/identity.js
})();
