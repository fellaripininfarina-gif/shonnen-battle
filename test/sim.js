// Simulación IA vs IA: verifica que el juego termina, no genera NaN y que la evolución funciona.
const assert = require('assert');
const G = require('../src/game.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

let evolutions = 0, clashes = 0, finished = 0;
const RUNS = 40;
for (let run = 0; run < RUNS; run++) {
  const rng = seeded(run + 1);
  const a = G.CHARS[run % 4], b = G.CHARS[(run + 1 + (run >> 2)) % 4];
  const s = G.createGame(a, b, { rng });
  const mem = [{}, {}];
  for (let t = 0; t < 60 * 120 && !s.over; t++) {
    const inputs = [G.aiInput(s, 0, mem[0]), G.aiInput(s, 1, mem[1])];
    G.step(s, inputs, 1 / 60);
    for (const e of s.events) { if (e.type === 'evolve') evolutions++; if (e.type === 'clash') clashes++; }
    s.events.length = 0;
    for (const f of s.fighters) {
      assert(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), 'valores no finitos');
      assert(f.x >= 0 && f.x <= G.W && f.y >= 0 && f.y <= G.H, 'fuera de la arena');
      assert(f.hp >= 0 && f.hp <= f.maxHp + 1e-6, 'hp fuera de rango');
    }
  }
  if (s.over) { finished++; assert([0, 1].includes(s.winner)); }
}
console.log({ RUNS, finished, evolutions, clashes });
assert(finished >= RUNS * 0.9, 'la mayoría de las partidas debería terminar');
assert(evolutions > 0, 'debería haber evoluciones');
console.log('OK');
