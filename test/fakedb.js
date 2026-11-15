// Realtime Database simulada en memoria (solo lo que usa el juego), con varios "clientes".
// Imita las rarezas de la real: los eventos llegan de forma asíncrona, null/vacíos se borran
// y los arrays vacíos desaparecen.
function split(path) { return String(path || '').split('/').filter(Boolean); }

function clean(v) {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) {
    const a = v.map(clean);
    return a.every((x) => x === undefined) ? undefined : a.map((x) => (x === undefined ? null : x));
  }
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) { const c = clean(v[k]); if (c !== undefined) o[k] = c; }
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}

class FakeDB {
  constructor() { this.data = {}; this.subs = []; this.scheduled = false; this.writes = 0; this.bytes = 0; }
  _get(path) {
    let n = this.data;
    for (const k of split(path)) { if (n === null || typeof n !== 'object') return undefined; n = n[k]; }
    return n;
  }
  _set(path, val) {
    const keys = split(path); val = clean(val);
    if (!keys.length) { this.data = val || {}; return; }
    const chain = [this.data]; let n = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (n[k] === null || typeof n[k] !== 'object') { if (val === undefined) return; n[k] = {}; }
      n = n[k]; chain.push(n);
    }
    const last = keys[keys.length - 1];
    if (val === undefined) delete n[last]; else n[last] = val;
    for (let i = chain.length - 1; i > 0; i--) { // poda padres vacíos
      if (Object.keys(chain[i]).length === 0) delete chain[i - 1][keys[i - 1]]; else break;
    }
  }
  _schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    Promise.resolve().then(() => { this.scheduled = false; this._flush(); });
  }
  _flush() {
    for (const s of [...this.subs]) {
      const v = this._get(s.path), j = JSON.stringify(v === undefined ? null : v);
      if (s.last !== j) { s.last = j; s.cb({ val: () => (v === undefined ? null : JSON.parse(j)), exists: () => v !== undefined }); }
    }
  }
  // Espera a que se entreguen todos los eventos pendientes.
  settle() { return new Promise((r) => setImmediate(() => setImmediate(r))); }
  client(name) { return new Handle(this, name); }
}

class Handle {
  constructor(db, name) { this.db = db; this.name = name; this.dc = []; this.connected = true; }
  ref(path) { return new Ref(this.db, this, path || ''); }
  disconnect() { // ejecuta los onDisconnect().remove() y corta las suscripciones
    this.connected = false;
    this.dc.forEach((p) => this.db._set(p, undefined));
    this.dc = [];
    this.db.subs = this.db.subs.filter((s) => s.handle !== this);
    this.db._schedule();
  }
}

class Ref {
  constructor(db, handle, path) { this.db = db; this.handle = handle; this.path = path; }
  _write(path, val) {
    this.db.writes++; this.db.bytes += JSON.stringify(val === undefined ? null : val).length;
    this.db._set(path, val); this.db._schedule();
  }
  set(v) { if (this.handle.connected) this._write(this.path, v); return Promise.resolve(); }
  remove() { return this.set(null); }
  update(obj) {
    if (this.handle.connected) for (const k of Object.keys(obj)) this._write(this.path ? this.path + '/' + k : k, obj[k]);
    return Promise.resolve();
  }
  on(evt, cb) { this.db.subs.push({ path: this.path, cb, handle: this.handle, last: undefined }); this.db._schedule(); return cb; }
  off(evt, cb) { this.db.subs = this.db.subs.filter((s) => !(s.cb === cb && s.path === this.path)); }
  once() {
    const v = this.db._get(this.path);
    return Promise.resolve({ val: () => (v === undefined ? null : JSON.parse(JSON.stringify(v))), exists: () => v !== undefined });
  }
  onDisconnect() {
    const h = this.handle, p = this.path;
    return {
      remove: () => { h.dc.push(p); return Promise.resolve(); },
      cancel: () => { h.dc = h.dc.filter((x) => x !== p); return Promise.resolve(); },
    };
  }
}

module.exports = { FakeDB };
