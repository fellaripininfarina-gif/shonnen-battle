// Simulación IA vs IA en 1v1 y 2v2: verifica que las partidas terminan, que no hay NaN,
// que los aliados no se dañan entre sí y que la evolución funciona.
const assert = require('assert');
const G = require('../src/game.js');

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function simulate(mode, runs) {
  let evolutions = 0, clashes = 0, finished = 0, downs = 0;
  for (let run = 0; run < runs; run++) {
    const rng = seeded(run + 1);
    const roster = G.makeRoster(mode, run % 4, rng);
    assert.strictEqual(roster.length, mode === '2v2' ? 4 : 2);
    assert.strictEqual(roster[0].team, 0);
    const s = G.createGame(roster, { rng });
    const mem = s.fighters.map(() => ({}));
    const teamHp = (t) => s.fighters.filter((f) => f.team === t).reduce((a, f) => a + f.hp, 0);
    for (let t = 0; t < 60 * 180 && !s.over; t++) {
      const inputs = s.fighters.map((_, i) => G.aiInput(s, i, mem[i]));
      G.step(s, inputs, 1 / 60);
      for (const e of s.events) {
        if (e.type === 'evolve') evolutions++;
        if (e.type === 'clash') clashes++;
        if (e.type === 'down') downs++;
      }
      s.events.length = 0;
      for (const f of s.fighters) {
        assert(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.hp), 'valores no finitos');
        assert(f.x >= 0 && f.x <= G.W && f.y >= 0 && f.y <= G.H, 'fuera de la arena');
        assert(f.hp >= 0 && f.hp <= f.maxHp + 1e-6, 'hp fuera de rango');
      }
    }
    if (s.over) {
      finished++;
      assert([0, 1].includes(s.winner));
      // el equipo ganador tiene alguien vivo y el perdedor, nadie
      assert(s.fighters.some((f) => f.team === s.winner && f.hp > 0), 'ganador sin vivos');
      assert(!s.fighters.some((f) => f.team !== s.winner && f.hp > 0), 'perdedor con vivos');
    }
    assert(teamHp(0) >= 0 && teamHp(1) >= 0);
  }
  return { mode, runs, finished, evolutions, clashes, downs };
}

// Fuego amigo: un disparo de un aliado no debe dañar al compañero.
(function friendlyFire() {
  const roster = G.makeRoster('2v2', 0, seeded(7));
  const s = G.createGame(roster, { rng: seeded(7) });
  const [a, b] = [s.fighters[0], s.fighters[1]];
  b.x = a.x + 60; b.y = a.y;
  const hp = b.hp;
  const none = { mx: 0, my: 0, ax: b.x, ay: b.y, fire: false, dash: false, special: false };
  const inputs = s.fighters.map(() => none);
  inputs[0] = { ...none, fire: true };
  for (let t = 0; t < 30; t++) G.step(s, inputs, 1 / 60);
  assert.strictEqual(b.hp, hp, 'el aliado no debe recibir daño');
})();

const r1 = simulate('1v1', 40);
const r2 = simulate('2v2', 40);
console.log(r1, r2);
for (const r of [r1, r2]) {
  assert(r.finished >= r.runs * 0.9, `${r.mode}: la mayoría de las partidas debería terminar`);
  assert(r.evolutions > 0, `${r.mode}: debería haber evoluciones`);
}
assert(r2.downs > 0, '2v2: debería haber luchadores caídos');
console.log('OK');
