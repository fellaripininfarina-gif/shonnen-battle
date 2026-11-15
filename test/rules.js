// Comprobaciones básicas de database.rules.json (no reemplaza probarlas en el simulador de Firebase).
const fs = require('fs');
const path = require('path');
const Auth = require('../src/auth.js');

const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8')).rules;
const fail = (m) => { console.error('FALLA: ' + m); process.exit(1); };

// Todas las reglas ".write" de cada ruta
function writes(node, trail, out) {
  for (const k of Object.keys(node)) {
    if (k === '.write') out.push([trail.join('/'), node[k]]);
    else if (node[k] && typeof node[k] === 'object') writes(node[k], trail.concat(k), out);
  }
  return out;
}
const all = writes(rules, [], []);
for (const [p, w] of all) {
  if (typeof w === 'string' && w.trim() === 'auth != null') fail('escritura abierta a cualquier usuario en /' + p);
}

// El dominio interno de las cuentas tiene que coincidir con el de auth.js
const text = fs.readFileSync(path.join(__dirname, '../database.rules.json'), 'utf8');
if (!text.includes("'" + Auth.DOMAIN + "'")) fail('las reglas no usan el dominio de auth.js (' + Auth.DOMAIN + ')');

// Rutas sensibles
const need = {
  'matches/$uid': rules.matches.$uid['.write'],
  'queue/$mode/$uid': rules.queue.$mode.$uid['.write'],
  'friends/$uid/$friend': rules.friends.$uid.$friend['.write'],
  'rooms/$room': rules.rooms.$room['.write'],
};
for (const k of Object.keys(need)) if (!need[k]) fail('falta la regla de ' + k);
if (!/requests/.test(need['friends/$uid/$friend'].split('auth.uid === $friend')[0])) fail('un usuario podría agregarse amigos sin solicitud aceptada');

console.log('ok reglas (' + all.length + ' reglas de escritura revisadas)');
console.log('OK');
