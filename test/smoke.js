// Prueba de humo de main.js sin Firebase: menú, modos contra la computadora y modo online
// deshabilitado cuando no hay conexión con Firebase.
const assert = require('assert');
const dom = require('./fakedom.js').install();

window.Game = require('../src/game.js');
window.Auth = require('../src/auth.js');
window.Net = require('../src/net.js');
require('../src/news.js');
assert(Array.isArray(window.NEWS) && window.NEWS.length >= 1, 'debe haber novedades');
const dates = window.NEWS.map((n) => n.date);
assert.strictEqual(new Set(dates).size, dates.length, 'una sola entrada por fecha');
require('../src/main.js');

assert(dom.onlineButtons.every((b) => b.disabled), 'sin Firebase, el online queda deshabilitado');

for (const [i, mode] of ['1v1', '2v2'].entries()) {
  dom.modeButtons[i].handlers.click();                    // elegir modo
  assert.strictEqual(dom.q('#pick').hidden, false, 'debe mostrarse el selector de luchador');
  dom.q('#chars').children[i].handlers.click();           // elegir luchador
  assert.strictEqual(dom.q('#ui').hidden, true, 'el menú se oculta al jugar');
  assert.strictEqual(dom.q('#c').hidden, false, 'el canvas se muestra al jugar');
  dom.key('KeyD'); dom.key('Space');
  for (let f = 0; f < 60 * 20; f++) dom.frame();
  dom.key('Escape');
  assert.strictEqual(dom.q('#ui').hidden, false, 'Esc vuelve al menú');
  assert.strictEqual(dom.q('#c').hidden, true);
  console.log('ok', mode);
}
console.log('OK');
