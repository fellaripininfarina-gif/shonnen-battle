// Habilidades: onda de área (Q), definitiva que atraviesa (E), barra de ulti y viaje por la red.
const assert = require('assert');
const Game = require('../src/game.js');
const Net = require('../src/net.js');
const C = require('../src/characters.js');

const goku = C.list.find((c) => c.id === 'goku-ui');
const kaito = C.list.find((c) => c.id === 'kaito');
const idle = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false, special: false, q: false, ult: false };
const seq = (g, over) => g.fighters.map((_, i) => (over[i] ? { ...idle, ...over[i] } : idle));

// --- Q: onda de área
{
  const g = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }]);
  const [a, b] = g.fighters;
  a.x = 400; a.y = 270; b.x = 480; b.y = 270; a.energy = 100;
  const hp0 = b.hp;
  Game.step(g, seq(g, [{ q: true }]), 1 / 60);
  assert(b.hp < hp0, 'la onda daña al rival cercano');
  assert(b.x > 480, 'la onda empuja al rival');
  assert.strictEqual(a.energy < 100, true, 'la onda cuesta energía');
  assert.strictEqual(a.act, 'pulse');
  assert(g.events.some((e) => e.type === 'pulse'));
  const hp1 = b.hp, en = a.energy;
  Game.step(g, seq(g, [{ q: true }]), 1 / 60);
  assert.strictEqual(b.hp, hp1, 'enfriamiento: no se puede repetir enseguida');
  assert(a.energy >= en, 'sin cobrar de nuevo');
  // fuera de alcance no hace daño
  const g2 = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }]);
  g2.fighters[0].energy = 100;
  const far = g2.fighters[1].hp;
  Game.step(g2, seq(g2, [{ q: true }]), 1 / 60);
  assert.strictEqual(g2.fighters[1].hp, far, 'fuera de alcance');
  console.log('ok onda Q');
}

// --- E: definitiva (necesita la barra llena y atraviesa)
{
  const g = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }, { char: kaito, team: 1 }]);
  const [a, b, c] = g.fighters;
  a.x = 100; a.y = 270; a.face = 0; b.x = 400; b.y = 270; c.x = 700; c.y = 270;
  Game.step(g, seq(g, [{ ult: true, ax: 900, ay: 270 }]), 1 / 60);
  assert.strictEqual(g.shots.length, 0, 'sin la barra llena no sale');
  a.ult = 100;
  Game.step(g, seq(g, [{ ult: true, ax: 900, ay: 270 }]), 1 / 60);
  assert.strictEqual(g.shots.length, 1); assert.strictEqual(g.shots[0].type, 'ult');
  assert.strictEqual(a.ult, 0, 'gasta la barra');
  const hb = b.hp, hc = c.hp, dmg0 = a.dmg * goku.ult.dmgMul; // el daño se mide antes de que evolucione
  for (let i = 0; i < 120; i++) Game.step(g, seq(g, [{ ax: 900, ay: 270 }]), 1 / 60);
  assert(b.hp < hb && c.hp < hc, 'atraviesa y golpea a los dos rivales');
  assert.strictEqual(Math.round(hb - b.hp), Math.round(dmg0), 'cada rival recibe el golpe una sola vez');
  console.log('ok definitiva E');
}

// --- la barra de ulti se carga golpeando y recibiendo golpes
{
  const g = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }]);
  const [a, b] = g.fighters;
  a.x = 100; a.y = 270; b.x = 300; b.y = 270;
  for (let i = 0; i < 90; i++) Game.step(g, seq(g, [{ fire: true, ax: 300, ay: 270 }]), 1 / 60);
  assert(a.ult > 0 && b.ult > 0, 'ambos cargan la barra');
  assert(a.ult > b.ult, 'quien golpea carga más');
  console.log('ok barra de ulti');
}

// --- viaje por la red: acción, ulti y tipo de disparo
{
  const g = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }]);
  const a = g.fighters[0]; a.ult = 100; a.face = 0;
  Game.step(g, seq(g, [{ ult: true, ax: 900, ay: 270 }]), 1 / 60);
  const meta = g.fighters.map((f) => ({ base: f.base, team: f.team, name: 'x' }));
  const d = Net.decode(JSON.parse(JSON.stringify(Net.encode(g, 1, [], 0))), meta);
  assert.strictEqual(d.fighters[0].act, 'ult'); assert(d.fighters[0].actT > 0);
  assert.strictEqual(d.shots[0].type, 'ult'); assert.strictEqual(d.shots[0].r, goku.ult.r);
  assert.strictEqual(d.fighters[0].ult, 0);
  assert(Math.abs(d.shots[0].a) < 0.02, 'ángulo del disparo');
  console.log('ok red');
}

// --- ataque básico: uno cada 0,5 s para todos; mantener apretado o clickear rápido da lo mismo
{
  assert(C.list.every((c) => c.shotCd === 0.5), 'todos los luchadores atacan cada 0,5 s');
  const count = (pattern) => {
    const g = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }]);
    g.fighters[1].x = 900; g.fighters[1].hp = g.fighters[1].maxHp = 1e6; // un blanco que no muere
    let n = 0;
    for (let i = 0; i < 120; i++) { // 2 segundos
      const before = g.shots.length;
      Game.step(g, seq(g, [{ fire: pattern(i), ax: 900, ay: 270 }]), 1 / 60);
      if (g.shots.length > before) n++;
    }
    return n;
  };
  const held = count(() => true), spam = count((i) => i % 2 === 0), tap = count((i) => i % 6 === 0);
  assert(held >= 4 && held <= 5, 'mantener apretado: ' + held + ' disparos en 2 s');
  assert.strictEqual(spam, held, 'clickear rápido no acelera el ataque');
  assert.strictEqual(tap, held, 'tocar cada 0,1 s tampoco');
  console.log('ok ataque básico cada 0,5 s (' + held + ' en 2 s)');
}

// --- los tiempos de recarga viajan por la red (para la barra de habilidades de los clientes)
{
  const g = Game.createGame([{ char: goku, team: 0 }, { char: kaito, team: 1 }]);
  g.fighters[0].energy = 100;
  Game.step(g, seq(g, [{ fire: true, dash: true, q: true, ax: 900, ay: 270 }]), 1 / 60);
  const meta = g.fighters.map((f) => ({ base: f.base, team: f.team, name: 'x' }));
  const d = Net.decode(JSON.parse(JSON.stringify(Net.encode(g, 1, [], 0))), meta).fighters[0];
  assert(Math.abs(d.shotCd - g.fighters[0].shotCd) < 0.011, 'ataque básico');
  assert(Math.abs(d.dashCd - g.fighters[0].dashCd) < 0.011 && d.dashCd > 0.8, 'esquiva');
  assert(Math.abs(d.qCd - g.fighters[0].qCd) < 0.011 && d.qCd > 3, 'habilidad Q');
  console.log('ok recargas por red');
}
console.log('OK');
