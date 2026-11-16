// Elección de animación y cuadros de los sprites (sin navegador).
const assert = require('assert');
const S = require('../src/sprites.js');

const base = { shotCd: 0.3, sprite: { dir: 'assets/characters/x', frameW: 64, frameH: 64,
  anims: { idle: { file: 'idle.png', frames: 4, fps: 8 }, run: { file: 'run.png', frames: 6, fps: 12 },
    hurt: { file: 'hurt.png', frames: 2, fps: 8 }, shoot: { file: 'shoot_{f}.png', frames: 3, fps: 12 } } } };
const fighter = (o) => Object.assign({ base, hurtT: 0, dashT: 0, actT: 0, act: '', form: 0 }, o);

assert.strictEqual(S.pickAnim(fighter({}), false), 'idle');
assert.strictEqual(S.pickAnim(fighter({}), true), 'run');
assert.strictEqual(S.pickAnim(fighter({ hurtT: 0.1 }), true), 'hurt');
assert.strictEqual(S.pickAnim(fighter({ act: 'shoot', actT: 0.1 }), true), 'shoot');
assert.strictEqual(S.pickAnim(fighter({ act: 'ult', actT: 0.1 }), false), 'shoot', 'ult sin animación propia cae en beam y luego en shoot');
assert.strictEqual(S.pickAnim(fighter({ act: 'pulse', actT: 0.1 }), false), 'shoot');
assert.strictEqual(S.pickAnim(fighter({ act: 'beam', actT: 0 }), false), 'idle', 'la acción ya terminó');
assert.strictEqual(S.pickAnim(fighter({ dashT: 0.1 }), false), 'idle', 'sin animación dash cae en idle');
assert.strictEqual(S.pickAnim({ base: { shotCd: 0.3 }, hurtT: 0, dashT: 0, actT: 0, form: 0 }, true), 'idle', 'sin sprite');
assert.strictEqual(S.frameIndex({ frames: 4, fps: 8 }, 0), 0);
assert.strictEqual(S.frameIndex({ frames: 4, fps: 8 }, 0.26), 2);
assert.strictEqual(S.frameIndex({ frames: 4, fps: 8 }, 100.0), 0);
assert.strictEqual(S.fileOf('a/b', 'shoot_{f}.png', 2), 'a/b/shoot_2.png');
assert.deepStrictEqual(S.thumb(base), { src: 'assets/characters/x/idle.png', frames: 4, frameW: 64, frameH: 64 });
assert.strictEqual(S.thumb({}), null);
assert.strictEqual(S.drawFx({}, { q: {} }, 0, 0, 0), 'none', 'sin efecto: se usa el anillo por defecto');
// en Node no hay Image: dibujar devuelve false y el juego usa el dibujo por defecto
assert.strictEqual(S.drawFighter({}, fighter({ x: 0, y: 0, face: 0 }), false, 0), false);
console.log('ok sprites');
console.log('OK');
