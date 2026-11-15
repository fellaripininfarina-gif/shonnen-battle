// Cuentas de jugador con usuario y contraseña, sobre Firebase Authentication.
// Por detrás se usa el método "Correo/contraseña" con un mail interno: usuario@shonnenbattle.game
(function (root) {
  const DOMAIN = '@shonnenbattle.game';

  function cleanName(u) {
    const n = String(u || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(n)) {
      throw new Error('El usuario debe tener entre 3 y 16 caracteres: letras, números o guion bajo (_).');
    }
    return n;
  }

  function checkPassword(p) {
    if (String(p || '').length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  function friendlyError(e) {
    const c = (e && e.code) || '';
    if (c === 'auth/email-already-in-use') return 'Ese nombre de usuario ya existe. Elegí otro.';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) {
      return 'Usuario o contraseña incorrectos.';
    }
    if (c === 'auth/weak-password') return 'La contraseña debe tener al menos 6 caracteres.';
    if (c === 'auth/operation-not-allowed') {
      return 'El registro con usuario y contraseña no está activado en Firebase (Authentication → Correo electrónico/contraseña).';
    }
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
    if (c === 'auth/network-request-failed') return 'No hay conexión. Revisá tu internet.';
    return (e && e.message) || 'Algo salió mal. Probá de nuevo.';
  }

  let auth = null, db = null, user = null, available = false;
  const subs = [];

  function init() {
    if (typeof firebase === 'undefined' || !root.FIREBASE_CONFIG) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(root.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.database();
      auth.onAuthStateChanged((u) => {
        user = u ? { uid: u.uid, name: String(u.email || '').split('@')[0] } : null;
        subs.forEach((f) => f(user));
      });
      available = true;
    } catch (e) {
      console.error('Firebase no pudo iniciar', e);
      available = false;
    }
    return available;
  }

  const api = {
    DOMAIN, cleanName, checkPassword, friendlyError, init,
    get available() { return available; },
    current: () => user,
    db: () => db,
    onChange: (f) => { subs.push(f); },
    async register(u, p) {
      const name = cleanName(u); checkPassword(p);
      try { await auth.createUserWithEmailAndPassword(name + DOMAIN, p); } catch (e) { throw new Error(friendlyError(e)); }
    },
    async login(u, p) {
      const name = cleanName(u); checkPassword(p);
      try { await auth.signInWithEmailAndPassword(name + DOMAIN, p); } catch (e) { throw new Error(friendlyError(e)); }
    },
    logout: () => auth.signOut(),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Auth = api;
})(typeof window !== 'undefined' ? window : globalThis);
