// Valida el catálogo de personajes y, para los que tienen sprites, que los archivos existan
// y que sus medidas coincidan con lo declarado (ancho = frameW × cuadros, alto = frameH).
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const C = require('../src/characters.js');
const root = path.join(__dirname, '..');

function png(file) { // lee el ancho y alto de un PNG sin librerías
  const b = fs.readFileSync(file);
  assert.strictEqual(b.slice(1, 4).toString(), 'PNG', file + ' no es un PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

assert(C.list.length >= 1 && C.list.length <= C.MAX, 'cantidad de personajes fuera de rango');
const ids = new Set();
for (const c of C.list) {
  assert(/^[a-z0-9_]+$/.test(c.id), 'id inválido: ' + c.id);
  assert(!ids.has(c.id), 'id repetido: ' + c.id); ids.add(c.id);
  for (const k of ['hp', 'speed', 'dmg', 'shotCd']) assert(c[k] > 0, c.id + ': ' + k + ' tiene que ser positivo');
  assert.strictEqual(c.forms.length, 3, c.id + ': tiene que tener 3 formas');
  assert(/^#[0-9a-f]{6}$/i.test(c.color), c.id + ': color inválido');
  for (const k of ['speed', 'r', 'life', 'dmgMul']) { assert(c.ki[k] > 0, c.id + ': ki.' + k); assert(c.beam[k] > 0, c.id + ': beam.' + k); }
  assert(c.beam.cost > 0 && c.beam.cost <= 100, c.id + ': beam.cost entre 1 y 100');

  const s = c.sprite;
  if (!s) continue;
  assert(s.dir && s.frameW > 0 && s.frameH > 0 && s.anims && s.anims.idle, c.id + ': el sprite necesita dir, frameW, frameH y la animación idle');
  const check = (anim, label, size, dir) => {
    assert(anim.file && anim.frames >= 1, c.id + ' ' + label + ': falta file o frames');
    for (const f of (anim.file.includes('{f}') ? [0, 1, 2] : [0])) {
      const file = path.join(root, dir, anim.file.replace('{f}', f));
      assert(fs.existsSync(file), c.id + ' ' + label + ': falta el archivo ' + path.relative(root, file));
      const d = png(file);
      assert.strictEqual(d.w, size.w * anim.frames, c.id + ' ' + label + ': ancho ' + d.w + ' pero se esperaba ' + size.w + ' × ' + anim.frames);
      assert.strictEqual(d.h, size.h, c.id + ' ' + label + ': alto ' + d.h + ' pero se esperaba ' + size.h);
    }
  };
  for (const name of Object.keys(s.anims)) check(s.anims[name], name, { w: s.frameW, h: s.frameH }, s.dir);
  for (const k of ['ki', 'beam']) {
    const sp = c[k].sprite;
    if (sp) check(sp, k, { w: sp.frameW, h: sp.frameH }, sp.dir || s.dir);
  }
}
console.log('ok catálogo (' + C.list.length + ' personajes)');
console.log('OK');
