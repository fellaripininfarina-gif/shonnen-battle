// Pruebas de amigos, invitaciones y salas privadas con la base de datos simulada.
const assert = require('assert');
const Game = require('../src/game.js');
const Net = require('../src/net.js');
const S = require('../src/social.js');
const { FakeDB } = require('./fakedb.js');

let clock = 2_000_000;
const now = () => clock;
const tick = (ms = 10) => { clock += ms; };

(async () => {
  const db = new FakeDB();
  const ana = { uid: 'uid-ana', name: 'ana' }, bruno = { uid: 'uid-bruno', name: 'bruno' }, cami = { uid: 'uid-cami', name: 'cami' };
  const H = { ana: db.client('ana'), bruno: db.client('bruno'), cami: db.client('cami') };
  const me = { ana, bruno, cami };
  for (const k of Object.keys(me)) S.ensureProfile(H[k], me[k]);
  await db.settle();
  assert.strictEqual(db._get('usernames/ana'), 'uid-ana');
  assert.strictEqual(db._get('presence/uid-bruno'), 1, 'presencia conectado');

  // ---------- amigos ----------
  await assert.rejects(S.sendRequest(H.ana, ana, 'ana', now), /vos mismo/);
  await assert.rejects(S.sendRequest(H.ana, ana, 'nadie', now), /No existe/);
  await assert.rejects(S.sendRequest(H.ana, ana, '  ', now), /Escribí/);
  assert.strictEqual(await S.sendRequest(H.ana, ana, 'Bruno', now), 'sent', 'normaliza mayúsculas');
  assert.strictEqual(db._get('requests/uid-bruno/uid-ana').name, 'ana');
  // bruno ve la solicitud y la acepta
  let seenReq = null;
  const unwatch = S.watch(H.bruno, 'requests/uid-bruno', (v) => { seenReq = v; });
  await db.settle();
  assert(seenReq && seenReq['uid-ana'], 'bruno ve la solicitud');
  await S.acceptRequest(H.bruno, bruno, 'uid-ana', 'ana', now);
  await db.settle();
  assert.strictEqual(db._get('friends/uid-ana/uid-bruno').name, 'bruno');
  assert.strictEqual(db._get('friends/uid-bruno/uid-ana').name, 'ana');
  assert.strictEqual(db._get('requests'), undefined, 'la solicitud se borra');
  assert.strictEqual(seenReq, null);
  unwatch();
  await assert.rejects(S.sendRequest(H.ana, ana, 'bruno', now), /ya es tu amigo/);
  // solicitudes cruzadas: se aceptan solas
  await S.sendRequest(H.cami, cami, 'ana', now);
  assert.strictEqual(await S.sendRequest(H.ana, ana, 'cami', now), 'accepted');
  assert(db._get('friends/uid-cami/uid-ana') && db._get('friends/uid-ana/uid-cami'));
  // rechazar
  await S.removeFriend(H.ana, ana, 'uid-cami');
  assert.strictEqual(db._get('friends/uid-cami'), undefined);
  await S.sendRequest(H.cami, cami, 'ana', now);
  await S.declineRequest(H.ana, ana, 'uid-cami');
  assert.strictEqual(db._get('requests'), undefined);
  console.log('ok amigos');

  // ---------- sala privada ----------
  const id = await S.createParty(H.ana, ana, 0, now);
  let party = db._get('parties/' + id);
  assert.strictEqual(party.host, 'uid-ana'); assert.strictEqual(party.mode, '1v1');
  assert.strictEqual(S.partyIssue(party), 'Hace falta al menos un amigo más en la sala.');
  tick();
  await S.sendInvite(H.ana, ana, 'uid-bruno', id, now);
  assert.strictEqual(db._get('invites/uid-bruno/uid-ana').party, id);
  await assert.rejects(S.joinParty(H.bruno, bruno, 'inexistente', 1, now), /ya no existe/);
  await S.joinParty(H.bruno, bruno, id, 1, now);
  await S.clearInvite(H.bruno, bruno, 'uid-ana');
  assert.strictEqual(db._get('invites'), undefined);
  party = db._get('parties/' + id);
  assert.strictEqual(party.members['uid-bruno'].team, 1, 'el invitado entra al equipo con menos gente');
  assert.strictEqual(S.partyIssue(party), null, '1v1 con uno por equipo se puede empezar');

  // 1v1 con los dos en el mismo equipo: no se puede
  await S.setMember(H.bruno, id, 'uid-bruno', { team: 0 });
  party = db._get('parties/' + id);
  assert.match(S.partyIssue(party), /1v1/);
  await S.setMember(H.bruno, id, 'uid-bruno', { team: 1, char: 3 });

  // 2v2 con 2 humanos enfrentados: cada uno con un CPU de compañero
  await S.setMode(H.ana, id, '2v2');
  party = db._get('parties/' + id);
  assert.strictEqual(S.partyIssue(party), null);
  let players = S.buildPlayers(party, () => 0.3);
  assert.strictEqual(players.length, 4);
  assert.deepStrictEqual(players.map((p) => p.team), [0, 0, 1, 1]);
  assert.strictEqual(players.filter((p) => p.cpu).length, 2);
  assert(players.every((p) => p.char >= 0 && p.char < 4));
  // 2v2 con los dos humanos en el mismo equipo: contra 2 CPU
  players = S.buildPlayers({ ...party, members: { ...party.members, 'uid-bruno': { ...party.members['uid-bruno'], team: 0 } } });
  assert.deepStrictEqual(players.map((p) => p.team), [0, 0, 1, 1]);
  assert.strictEqual(players.filter((p) => !p.cpu).length, 2);

  // la sala admite hasta 4
  tick(); await S.joinParty(H.cami, cami, id, 2, now);
  const extra = { uid: 'uid-x', name: 'x' }, extra2 = { uid: 'uid-y', name: 'y' };
  tick(); await S.joinParty(db.client('x'), extra, id, 0, now);
  await assert.rejects(S.joinParty(db.client('y'), extra2, id, 0, now), /llena/);
  await S.kick(H.ana, id, 'uid-x');
  assert.strictEqual(db._get('parties/' + id + '/members/uid-x'), undefined);

  // se desconecta un invitado: sale solo de la sala
  H.cami.disconnect(); await db.settle();
  assert.strictEqual(db._get('parties/' + id + '/members/uid-cami'), undefined);
  assert(db._get('parties/' + id), 'la sala sigue');
  console.log('ok sala');

  // ---------- empezar: sala 2v2 con 2 humanos + 2 CPU, partida completa ----------
  const got = {};
  const stops = ['uid-ana', 'uid-bruno'].map((uid) => Net.watchMatch(H[uid === 'uid-ana' ? 'ana' : 'bruno'], uid, (rid) => { got[uid] = rid; }));
  tick();
  const roomId = await S.startParty(H.ana, id, db._get('parties/' + id), { now, rng: () => 0.5 });
  await db.settle(); await db.settle();
  assert.strictEqual(got['uid-ana'], roomId); assert.strictEqual(got['uid-bruno'], roomId);
  assert.strictEqual(db._get('matches'), undefined, 'los avisos se limpian');
  stops.forEach((s) => s());
  const room = await Net.loadRoom(H.ana, roomId);
  assert.strictEqual(room.host, 'uid-ana'); assert.strictEqual(room.party, id);
  assert.strictEqual(room.players.length, 4);

  const host = Net.createHost(H.ana, roomId, room, 'uid-ana', { Game, now });
  const client = Net.createClient(H.bruno, roomId, room, 'uid-bruno', { Game, now });
  const aim = (g, me) => { const f = g.fighters[me], e = g.fighters.find((x) => x.team !== f.team && x.hp > 0) || f; return { mx: 0, my: 0, ax: e.x, ay: e.y, fire: true, dash: false, special: false }; };
  for (let t = 0; t < 60 * 170 && !host.game.over; t++) {
    tick(1000 / 60);
    host.tick(aim(host.game, host.players.findIndex((p) => p.uid === 'uid-ana')), 1 / 60);
    const v = client.view();
    client.sendInput(v ? aim(v, host.players.findIndex((p) => p.uid === 'uid-bruno')) : { mx: 0, my: 0, ax: 0, ay: 0 });
    client.takeEvents();
    if (t % 3 === 0) await db.settle();
  }
  await db.settle();
  assert(host.game.over, 'la partida con CPU termina');
  const cpuIdx = host.players.map((p, i) => (p.cpu ? i : -1)).filter((i) => i >= 0);
  assert.strictEqual(cpuIdx.length, 2);
  assert(cpuIdx.some((i) => host.game.fighters[i].power > 0 || host.game.fighters[i].form > 0 || host.game.fighters[i].hp < host.game.fighters[i].maxHp), 'los CPU participaron');
  assert.strictEqual(client.view().over, true);
  assert.strictEqual(client.view().fighters.find((f, i) => host.players[i].cpu).name, 'CPU');
  host.stop(); client.stop();
  await db.settle();
  assert(db._get('parties/' + id), 'la sala sigue después de la partida (se puede jugar otra)');
  console.log('ok partida con sala');

  // el anfitrión cierra la sala
  await S.leaveParty(H.ana, ana, id, true);
  assert.strictEqual(db._get('parties/' + id), undefined);
  // y si el anfitrión se desconecta, la sala también se cierra
  const id2 = await S.createParty(H.bruno, bruno, 0, now);
  assert(db._get('parties/' + id2));
  H.bruno.disconnect(); await db.settle();
  assert.strictEqual(db._get('parties/' + id2), undefined, 'se cierra si el anfitrión se cae');
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
