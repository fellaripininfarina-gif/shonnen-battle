// Prueba de humo de main.js con un DOM/canvas simulado: abre el menú, inicia 1v1 y 2v2,
// corre varios segundos de juego dibujando cada cuadro y vuelve al menú con Esc.
const assert = require('assert');

const listeners = {};
function el() {
  const e = {
    hidden: false, dataset: {}, style: { setProperty() {} }, textContent: '', className: '',
    classList: { toggle() {} }, children: [], handlers: {},
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
    addEventListener(t, fn) { this.handlers[t] = fn; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 540 }; },
  };
  return e;
}
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const els = {};
const modeButtons = ['1v1', '2v2'].map((m) => { const b = el(); b.dataset.mode = m; return b; });
const tabButtons = ['play', 'news'].map((t) => { const b = el(); b.dataset.tab = t; return b; });
function q(sel) {
  if (!els[sel]) { els[sel] = el(); if (sel === '#c') els[sel].getContext = () => ctx; }
  return els[sel];
}
global.window = globalThis;
global.document = {
  querySelector: q,
  querySelectorAll: (s) => (s === '[data-mode]' ? modeButtons : s === 'nav button' ? tabButtons : []),
  createElement: el,
};
global.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };
let raf = null;
global.requestAnimationFrame = (fn) => { raf = fn; };
const fire = (t, ev) => (listeners[t] || []).forEach((fn) => fn(ev));

window.Game = require('../src/game.js');
require('../src/news.js');
assert(Array.isArray(window.NEWS) && window.NEWS.length >= 1, 'debe haber novedades');
const dates = window.NEWS.map((n) => n.date);
assert.strictEqual(new Set(dates).size, dates.length, 'una sola entrada por fecha');
require('../src/main.js');

let now = 0;
function run(seconds) { for (let i = 0; i < seconds * 60; i++) { now += 1000 / 60; const f = raf; raf = null; f(now); } }

for (const [i, mode] of ['1v1', '2v2'].entries()) {
  modeButtons[i].handlers.click();                        // elegir modo
  assert.strictEqual(q('#pick').hidden, false, 'debe mostrarse el selector de luchador');
  q('#chars').children[i].handlers.click();               // elegir luchador
  assert.strictEqual(q('#ui').hidden, true, 'el menú se oculta al jugar');
  assert.strictEqual(q('#c').hidden, false, 'el canvas se muestra al jugar');
  fire('keydown', { code: 'KeyD', preventDefault() {} });
  fire('keydown', { code: 'Space', preventDefault() {} });
  run(20);
  fire('keyup', { code: 'KeyD' });
  fire('keydown', { code: 'Escape', preventDefault() {} });
  assert.strictEqual(q('#ui').hidden, false, 'Esc vuelve al menú');
  assert.strictEqual(q('#c').hidden, true);
  console.log('ok', mode);
}
console.log('OK');
