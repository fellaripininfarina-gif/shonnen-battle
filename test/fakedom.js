// Navegador simulado mínimo (DOM + canvas) para probar src/main.js en Node.
function install() {
  const listeners = {};
  const texts = [];
  function el() {
    const e = {
      hidden: false, disabled: false, value: '', title: '', dataset: {}, style: { setProperty() {} }, className: '',
      classList: { toggle() {}, add() {}, remove() {} }, children: [], handlers: {}, _text: '',
      append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, fn) { this.handlers[t] = fn; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
    };
    Object.defineProperty(e, 'textContent', { get() { return this._text; }, set(v) { this._text = v; this.children = []; } });
    return e;
  }
  const ctx = new Proxy({}, {
    get: (t, k) => (k === 'fillText' ? (s) => texts.push(String(s)) : k in t ? t[k] : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const els = {};
  const mk = (attr, vals) => vals.map((v) => { const b = el(); b.dataset[attr] = v; return b; });
  const modeButtons = mk('mode', ['1v1', '2v2']);
  const onlineButtons = mk('online', ['1v1', '2v2']);
  const tabButtons = mk('tab', ['play', 'friends', 'news']);
  const partyModeButtons = mk('pmode', ['1v1', '2v2']);
  function q(sel) {
    if (!els[sel]) { els[sel] = el(); if (sel === '#c') els[sel].getContext = () => ctx; }
    return els[sel];
  }
  global.window = globalThis;
  global.document = {
    querySelector: q,
    querySelectorAll: (s) => (s === '[data-mode]' ? modeButtons : s === '[data-online]' ? onlineButtons
      : s === '[data-pmode]' ? partyModeButtons : s === 'nav button' ? tabButtons : []),
    createElement: el,
  };
  global.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
  let raf = null;
  global.requestAnimationFrame = (fn) => { raf = fn; };
  const fire = (t, ev) => (listeners[t] || []).forEach((fn) => fn(ev));
  let t = 0;
  const frame = () => { t += 1000 / 60; const f = raf; raf = null; f(t); };
  return { q, modeButtons, onlineButtons, tabButtons, partyModeButtons, fire, frame, texts, key: (code) => fire('keydown', { code, preventDefault() {} }) };
}
module.exports = { install };
