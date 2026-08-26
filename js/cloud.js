/* ============================================================
   Crafty Central — cloud.js (ES module)
   Thin Firebase wrapper. Loads the SDK from Google's CDN only
   when firebase-config.js is filled in; otherwise the app stays
   in local demo mode. Everything the rest of the app needs is
   exposed on window.Cloud — no other file imports Firebase.
   ============================================================ */

window.Cloud = null;

if (window.FIREBASE_CONFIG) {
  try {
    const V = '10.12.2';
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`),
    ]);

    const app = initializeApp(window.FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);

    window.Cloud = {
      /* ---- auth ---- */
      onAuth: (cb) => authMod.onAuthStateChanged(auth, cb),
      signIn: (email, pass) => authMod.signInWithEmailAndPassword(auth, email, pass),
      signUp: async (email, pass, name) => {
        const cred = await authMod.createUserWithEmailAndPassword(auth, email, pass);
        if (name) await authMod.updateProfile(cred.user, { displayName: name });
        return cred;
      },
      signOut: () => authMod.signOut(auth),

      /* ---- live data ----
         watch(col, cb): cb receives the full doc array on every
         change; the returned promise resolves after the first
         snapshot so boot can wait for initial data. */
      watch: (col, cb) => new Promise((resolve, reject) => {
        fsMod.onSnapshot(
          fsMod.collection(db, col),
          (snap) => { cb(snap.docs.map(d => d.data())); resolve(); },
          (err) => { console.error('watch ' + col, err); reject(err); }
        );
      }),
      watchDoc: (col, id, cb) => {
        fsMod.onSnapshot(fsMod.doc(db, col, id), (snap) => cb(snap.exists() ? snap.data() : null));
      },
      save: (col, id, obj) =>
        fsMod.setDoc(fsMod.doc(db, col, id), JSON.parse(JSON.stringify(obj)))
          .catch((err) => console.error('save ' + col + '/' + id, err)),
      remove: (col, id) =>
        fsMod.deleteDoc(fsMod.doc(db, col, id))
          .catch((err) => console.error('remove ' + col + '/' + id, err)),
    };
  } catch (e) {
    console.error('Firebase failed to load — falling back to local demo mode.', e);
    window.Cloud = null;
  }
}

/* app.js waits for this before booting, since DOMContentLoaded does not
   wait for this module's top-level awaits */
window.CLOUD_READY = true;
document.dispatchEvent(new Event('cloud-ready'));
