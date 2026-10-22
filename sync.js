/* Retest cloud sync (Firebase Auth + Firestore). Loads Firebase lazily, so the app still starts offline. */
(function () {
  'use strict';
  const CFG = { apiKey: 'AIzaSyCpJyXT7bKU5hx9EmyXeyHMSO7ZSq8wvhY', authDomain: 'retest-16dee.firebaseapp.com', projectId: 'retest-16dee', storageBucket: 'retest-16dee.firebasestorage.app', messagingSenderId: '777287438035', appId: '1:777287438035:web:69bae0f0b1f947ea0f8e26' };
  const V = '10.14.1', BASE = 'https://www.gstatic.com/firebasejs/' + V + '/';
  const MKEY = 'retest.sync.m', UKEY = 'retest.sync.uid';
  let H = null, fb = null, auth = null, db = null, user = null, status = 'Not signed in', timer = null, busy = false, ready = false;

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }
  async function boot() {
    try {
      await loadScript(BASE + 'firebase-app-compat.js');
      await Promise.all([loadScript(BASE + 'firebase-auth-compat.js'), loadScript(BASE + 'firebase-firestore-compat.js')]);
      fb = window.firebase; fb.initializeApp(CFG); auth = fb.auth(); db = fb.firestore(); ready = true;
      auth.onAuthStateChanged((u) => { user = u; status = u ? 'Signed in as ' + (u.email || u.displayName) : 'Not signed in'; refresh(); if (u) firstSync(); });
    } catch (e) { status = 'Sync unavailable (offline?)'; refresh(); }
  }
  function refresh() { const e = document.querySelector('#sy_st'); if (e) e.textContent = status; if (H && H.refresh) H.refresh(); }
  const hasPlanLocal = () => { const P = H.getP(); return !!(P && P.plan); };
  const getM = () => +(localStorage.getItem(MKEY) || 0);
  const docRef = () => db.collection('users').doc(user.uid);
  const imgCol = () => docRef().collection('imgs');

  async function pushAll(withImgs) {
    if (!user || busy) return; busy = true; status = 'Syncing\u2026'; refresh();
    try {
      const P = H.getP(); if (!P || !P.plan) { status = 'Signed in, nothing to upload yet'; return; }
      const m = P._m || Date.now();
      const body = JSON.stringify(P);
      if (body.length > 900000) throw new Error('Profile too large for cloud (' + Math.round(body.length / 1024) + ' KB)');
      await docRef().set({ profile: body, m, v: 1, saved: Date.now() });
      if (withImgs) {
        const imgs = H.getImgs(), old = await imgCol().get(), b = db.batch();
        imgs.forEach((d, i) => b.set(imgCol().doc(String(i).padStart(4, '0')), { d }));
        old.forEach((x) => { if (+x.id >= imgs.length) b.delete(x.ref); });
        await b.commit();
      }
      localStorage.setItem(MKEY, String(m));
      status = 'Synced ' + new Date().toLocaleTimeString();
    } catch (e) { status = 'Sync error: ' + (e.message || e.code); }
    busy = false; refresh();
  }
  async function pullApply() {
    const snap = await docRef().get(); if (!snap.exists) return false;
    const d = snap.data(), imgs = (await imgCol().get()).docs.map((x) => x.data().d);
    H.applyRemote(JSON.parse(d.profile), imgs, d.m);
    return true;
  }
  async function firstSync() {
    if (!user) return;
    try {
      const snap = await docRef().get(), P = H.getP(), same = localStorage.getItem(UKEY) === user.uid;
      localStorage.setItem(UKEY, user.uid);
      if (!snap.exists) { if (hasPlanLocal()) await pushAll(true); else { status = 'Signed in. This account has no saved plan yet.'; refresh(); } return; }
      const rm = snap.data().m || 0, lm = P ? (P._m || 0) : 0, hasLocal = P && P.plan;
      if (!hasLocal) { await pullApply(); return; }
      if (same) {
        if (rm > getM() && lm <= getM()) { await pullApply(); return; }     // other device changed, we didn't
        if (lm > getM() && rm <= getM()) { await pushAll(true); return; }   // we changed, other didn't
        if (rm === lm) { status = 'Synced'; refresh(); return; }
      }
      // conflict, or first time this device meets this account
      H.ask('<h3>Which data do you keep?</h3><p class="muted sm">This device and your cloud account both have data.</p><p class="sm">Cloud: saved ' + new Date(snap.data().saved || rm).toLocaleString() + '<br>This device: last change ' + (lm ? new Date(lm).toLocaleString() : 'unknown') + '</p><div class="tbtns"><button class="ghost2" id="sy_dev">Use this device</button><button class="close" id="sy_cl">Use cloud</button></div>',
        () => pushAll(true), () => pullApply());
    } catch (e) { status = 'Sync error: ' + (e.message || e.code); refresh(); }
  }
  function changed(imgs) {
    if (!user) return; clearTimeout(timer);
    timer = setTimeout(() => pushAll(!!imgs), imgs ? 800 : 4000);
    if (imgs) window.__rtImgs = true;
  }
  async function checkRemote() {
    if (!user || busy) return;
    try {
      const snap = await docRef().get(); if (!snap.exists) return;
      const rm = snap.data().m || 0, P = H.getP();
      if (rm > getM() && (!P || (P._m || 0) <= getM())) H.ask('<h3>Newer data found</h3><p class="muted sm">Another device saved changes. Load them now?</p><div class="tbtns"><button class="ghost2" id="sy_dev">Not now</button><button class="close" id="sy_cl">Load</button></div>', () => {}, () => pullApply());
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { if (timer) { clearTimeout(timer); timer = null; pushAll(!!window.__rtImgs); } }
    else checkRemote();
  });

  const errMsg = (e) => ({ 'auth/invalid-credential': 'Wrong email or password', 'auth/invalid-email': 'That email looks wrong', 'auth/weak-password': 'Password needs 6+ characters', 'auth/email-already-in-use': 'That email already has an account, use Sign in', 'auth/popup-closed-by-user': 'Sign-in cancelled', 'auth/unauthorized-domain': 'This site is not an authorized domain in Firebase', 'auth/operation-not-allowed': 'That sign-in method is not enabled in Firebase' }[e.code] || e.message || 'Failed');

  window.Sync = {
    attach(h) { H = h; boot(); },
    changed,
    cardHtml(welcome) {
      if (user) return '<div class="card"><b>Account</b><p class="muted sm">Your plan, journal, accounts, notes, settings and pictures follow you to any device you sign in on.</p><p class="sm" id="sy_st">' + status + '</p><button class="btn" id="sy_now">Upload this device</button> <button class="btn ghost" id="sy_pull">Load from cloud</button> <button class="btn ghost" id="sy_out">Sign out</button></div>';
      return '<div class="card"><b>' + (welcome ? 'Already have an account?' : 'Account') + '</b><p class="muted sm">' + (welcome ? 'Sign in and your plan, journal and settings load straight in. No setup needed.' : 'Sign in to keep your data in the cloud and use it on other devices. ') + (ready ? '' : 'Loading\u2026 ') + '</p><p class="sm" id="sy_st">' + status + '</p>' +
        '<input id="sy_em" type="email" placeholder="Email" autocomplete="email" style="width:100%;margin:4px 0"><input id="sy_pw" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;margin:4px 0">' +
        '<button class="btn" id="sy_in">Sign in</button> <button class="btn ghost" id="sy_up">Create account</button> <button class="btn ghost" id="sy_g">Google</button> <button class="btn ghost" id="sy_rs">Forgot password</button></div>';
    },
    bind($) {
      const say = (t) => { const e = $('#sy_st'); if (e) e.textContent = t; };
      const go = (fn) => async () => { if (!ready) return say('Not loaded yet, check your connection'); try { await fn(); } catch (e) { say(errMsg(e)); } };
      if (user) { $('#sy_now').onclick = () => { pushAll(true); }; $('#sy_pull').onclick = async () => { try { status = 'Loading\u2026'; refresh(); if (!(await pullApply())) { status = 'Nothing saved in the cloud yet'; refresh(); } } catch (e) { status = 'Load error: ' + (e.message || e.code); refresh(); } }; $('#sy_out').onclick = async () => { await auth.signOut(); localStorage.removeItem(UKEY); }; return; }
      const cr = () => [$('#sy_em').value.trim(), $('#sy_pw').value];
      $('#sy_in').onclick = go(() => auth.signInWithEmailAndPassword(...cr()));
      $('#sy_up').onclick = go(() => auth.createUserWithEmailAndPassword(...cr()));
      $('#sy_g').onclick = go(() => auth.signInWithPopup(new fb.auth.GoogleAuthProvider()));
      $('#sy_rs').onclick = go(async () => { const e = $('#sy_em').value.trim(); if (!e) return say('Type your email first'); await auth.sendPasswordResetEmail(e); say('Reset email sent'); });
    }
  };
})();
