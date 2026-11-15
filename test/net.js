// Pruebas de la capa online con una base de datos simulada:
// emparejamiento 1v1 y 2v2, partida completa anfitrión/cliente, IA de relleno y cuenta regresiva.
const assert = require('assert');
const Game = require('../src/game.js');
const Net = require('../src/net.js');
const Auth = require('../src/auth.js');
const { FakeDB } = require('./fakedb.js');

let clock = 1_000_000;
const now = () => clock;
const advance = (ms) => { clock += ms; };

// ---------- cuentas ----------
assert.strictEqual(Auth.cleanName('  Ana_01 '), 'ana_01');
assert.throws(() => Auth.cleanName('ab'), /entre 3 y 16/);
assert.throws(() => Auth.cleanName('con espacio'), /entre 3 y 16/);
assert.throws(() => Auth.cleanName('x'.repeat(17)), /entre 3 y 16/);
assert.throws(() => Auth.checkPassword('12345'), /al menos 6/);
assert.strictEqual(Auth.friendlyError({ code: 'auth/email-already-in-use' }), 'Ese nombre de usuario ya existe. Elegí otro.');
assert.strictEqual(Auth.friendlyError({ code: 'auth/invalid-credential' }), 'Usuario o contraseña incorrectos.');
console.log('ok cuentas');

// ---------- emparejamiento ----------
async function matchmaking(mode, n) {
  const db = new FakeDB();
  const handles = Array.from({ length: n }, (_, i) => db.client('p' + i));
  const matched = {}, progress = {};
  const searches = handles.map((h, i) => {
    const uid = 'u' + i;
    const s = Net.joinQueue(h, { uid, name: 'jugador' + i, char: i % 4 }, mode, {
      now, onMatch: (id) => { matched[uid] = id; }, onProgress: (c, need) => { progress[uid] = [c, need]; },
    });
    advance(5); // cada uno entra un poco después que el anterior
    return s;
  });
  await db.settle(); await db.settle();
  return { db, handles, matched, progress, searches };
}

(async () => {
  // 1v1: dos jugadores → misma sala, anfitrión = el que esperaba hace más
  {
    const { db, matched } = await matchmaking('1v1', 2);
    const ids = Object.values(matched);
    assert.strictEqual(ids.length, 2, 'ambos reciben sala');
    assert.strictEqual(ids[0], ids[1]);
    const room = db._get('rooms/' + ids[0]);
    assert.strictEqual(room.host, 'u0');
    assert.deepStrictEqual(room.players.map((p) => p.team), [0, 1]);
    assert.strictEqual(db._get('queue'), undefined, 'la cola queda vacía');
    assert.strictEqual(db._get('matches'), undefined, 'los avisos se limpian');
  }
  // 2v2: cuatro jugadores, equipos 0,1,0,1
  {
    const { db, matched } = await matchmaking('2v2', 4);
    const ids = [...new Set(Object.values(matched))];
    assert.strictEqual(Object.keys(matched).length, 4);
    assert.strictEqual(ids.length, 1, 'los cuatro en la misma sala');
    const room = db._get('rooms/' + ids[0]);
    assert.deepStrictEqual(room.players.map((p) => p.team), [0, 1, 0, 1]);
    assert.strictEqual(room.players.length, 4);
  }
  // 2v2 con solo 3 jugadores: nadie arranca; progreso 3/4
  {
    const { matched, progress } = await matchmaking('2v2', 3);
    assert.strictEqual(Object.keys(matched).length, 0);
    assert.deepStrictEqual(progress.u0, [3, 4]);
  }
  // Cancelar y desconectarse sacan al jugador de la cola
  {
    const { db, handles, searches, matched } = await matchmaking('2v2', 3);
    searches[0].cancel(); await db.settle();
    assert.strictEqual(db._get('queue/2v2/u0'), undefined);
    handles[1].disconnect(); await db.settle();
    assert.strictEqual(db._get('queue/2v2/u1'), undefined, 'onDisconnect limpia la cola');
    assert.strictEqual(Object.keys(matched).length, 0);
  }
  console.log('ok emparejamiento');

  // ---------- partida completa 1v1: anfitrión + cliente ----------
  async function playMatch(mode, humans, clientsSilent) {
    const { db, handles, matched } = await matchmaking(mode, humans);
    const roomId = matched.u0;
    const room = await Net.loadRoom(handles[0], roomId);
    const host = Net.createHost(handles[0], roomId, room, 'u0', { Game, now });
    const clients = [];
    for (let i = 1; i < humans; i++) {
      if (clientsSilent && clientsSilent.includes(i)) continue;
      clients.push({ i, c: Net.createClient(handles[i], roomId, room, 'u' + i, { Game, now }) });
    }
    const aimAtEnemy = (me, game) => {
      const f = game.fighters[me];
      const foes = game.fighters.filter((g) => g.team !== f.team && g.hp > 0);
      const t = foes[0] || f;
      return { mx: 0, my: Math.sin(clock / 700 + me), ax: t.x, ay: t.y, fire: true, dash: false, special: false };
    };
    let firstCountdown = null, snapshots = 0, states = 0, maxCdSeen = 0;
    for (let t = 0; t < 60 * 150 && !host.game.over; t++) {
      advance(1000 / 60);
      host.tick(aimAtEnemy(0, host.game), 1 / 60);
      for (const { i, c } of clients) {
        const v = c.view();
        c.sendInput(aimAtEnemy(i, v || host.game));
        if (v) { states++; maxCdSeen = Math.max(maxCdSeen, v.cd); }
        c.takeEvents();
      }
      if (t % 3 === 0) await db.settle();
    }
    await db.settle(); await db.settle();
    return { db, host, clients, handles, roomId, states, maxCdSeen };
  }

  {
    const r = await playMatch('1v1', 2);
    assert(r.host.game.over, 'la partida termina');
    assert(r.maxCdSeen >= 2, 'el cliente ve la cuenta regresiva');
    const cv = r.clients[0].c.view();
    assert(cv, 'el cliente recibe estado');
    assert.strictEqual(cv.over, true, 'el cliente ve el final');
    assert.strictEqual(cv.winner, r.host.game.winner, 'mismo ganador en anfitrión y cliente');
    cv.fighters.forEach((f, i) => {
      const h = r.host.game.fighters[i];
      assert(Math.abs(f.hp - h.hp) < 0.2, 'misma vida');
      assert.strictEqual(f.form, h.form);
    });
    console.log('ok 1v1 online (partida de', Math.round(r.host.game.time), 's simulados, ganó el equipo', cv.winner + ')');
    const kb = Math.round(r.db.bytes / 1024);
    console.log('   datos escritos en total:', kb, 'KB');
    r.host.stop();
    await r.db.settle();
    assert.strictEqual(r.db._get('rooms/' + r.roomId), undefined, 'el anfitrión borra la sala al salir');
  }

  // 2v2 con 4 humanos, uno de ellos "mudo" (nunca manda controles) → lo reemplaza la IA
  {
    const r = await playMatch('2v2', 4, [3]);
    assert(r.host.game.over, '2v2: la partida termina');
    assert(r.host.game.fighters[3].hp >= 0);
    const cv = r.clients[0].c.view();
    assert.strictEqual(cv.fighters.length, 4);
    assert.strictEqual(cv.over, true);
    // el jugador mudo (u3) fue controlado por la IA: si hubiera estado quieto sin disparar
    // jamás habría generado energía gastada ni daño; comprobamos que ganó poder o hizo daño
    const ghost = r.host.game.fighters[3];
    assert(ghost.power > 0 || ghost.energy !== 30 || ghost.form > 0, 'la IA movió al jugador desconectado');
    console.log('ok 2v2 online con IA de relleno');
    r.host.stop();
  }

  // Si el anfitrión desaparece, el cliente lo detecta
  {
    const { db, handles, matched } = await matchmaking('1v1', 2);
    const room = await Net.loadRoom(handles[0], matched.u0);
    const host = Net.createHost(handles[0], matched.u0, room, 'u0', { Game, now });
    const client = Net.createClient(handles[1], matched.u0, room, 'u1', { Game, now });
    for (let t = 0; t < 60 * 4; t++) { advance(1000 / 60); host.tick(Game.aiInput(host.game, 0, {}), 1 / 60); if (t % 3 === 0) await db.settle(); }
    assert(client.view(), 'recibe estado');
    assert.strictEqual(client.hostLost(), false);
    advance(Net.HOST_LOST_MS + 100);
    assert.strictEqual(client.hostLost(), true, 'detecta que el anfitrión se perdió');
    console.log('ok anfitrión perdido');
  }

  // Los toques de disparo se cuentan aunque se pierdan muestras (choque de rayos)
  {
    const { db, handles, matched } = await matchmaking('1v1', 2);
    const room = await Net.loadRoom(handles[0], matched.u0);
    const host = Net.createHost(handles[0], matched.u0, room, 'u0', { Game, now });
    const client = Net.createClient(handles[1], matched.u0, room, 'u1', { Game, now });
    advance(Net.COUNTDOWN_MS + 100);
    const idle = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false, special: false };
    host.game.clash = { t: 2, a: 0, b: 1, push: { 0: 0, 1: 0 }, x: 480, y: 270 };
    // 6 toques rápidos del cliente, cada uno dentro del mismo cuadro de red de 50 ms
    for (let k = 0; k < 6; k++) {
      client.sendInput({ ...idle, fire: true }); client.sendInput(idle); advance(5);
    }
    await db.settle();
    for (let t = 0; t < 30; t++) { advance(16); host.tick(idle, 1 / 60); }
    assert(host.game.clash === null || host.game.clash.push[1] >= 3,
      'el anfitrión debe registrar varios toques del cliente');
    console.log('ok toques en el choque');
  }
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
