// Prueba de punta a punta del modo online: el menú real (main.js) con una Firebase simulada.
// Una persona se registra, busca 1v1 online y juega contra un segundo jugador simulado,
// primero como anfitrión y después como cliente.
const assert = require('assert');
const dom = require('./fakedom.js').install();
const { FakeDB } = require('./fakedb.js');

// reloj controlado (el juego online usa Date.now)
let clock = 5_000_000;
Date.now = () => clock;

const db = new FakeDB();
// Firebase simulada: autenticación mínima + base de datos compartida
let authCb = null, fbUser = null;
const accounts = {};
const fakeAuth = {
  onAuthStateChanged(cb) { authCb = cb; Promise.resolve().then(() => cb(fbUser)); },
  async createUserWithEmailAndPassword(email, pw) {
    if (accounts[email]) { const e = new Error('x'); e.code = 'auth/email-already-in-use'; throw e; }
    accounts[email] = pw; fbUser = { uid: 'uid-a-ui', email }; authCb(fbUser);
  },
  async signInWithEmailAndPassword(email, pw) {
    if (accounts[email] !== pw) { const e = new Error('x'); e.code = 'auth/invalid-credential'; throw e; }
    fbUser = { uid: 'uid-a-ui', email }; authCb(fbUser);
  },
  async signOut() { fbUser = null; authCb(null); },
};
const uiHandle = db.client('ui');
global.firebase = { apps: [], initializeApp() { this.apps.push(1); }, auth: () => fakeAuth, database: () => uiHandle };

const Game = require('../src/game.js');
const Net = require('../src/net.js');
const Social = require('../src/social.js');
window.Game = Game; window.Auth = require('../src/auth.js'); window.Net = Net; window.Social = Social;
require('../src/config.js');
require('../src/news.js');
require('../src/main.js');

async function run(seconds, perFrame) {
  for (let f = 0; f < seconds * 60; f++) {
    clock += 1000 / 60;
    dom.frame();
    if (perFrame) perFrame(f);
    if (f % 3 === 0) await db.settle();
  }
  await db.settle();
}
const submit = async () => { await dom.q('#authForm').handlers.submit({ preventDefault() {} }); await db.settle(); };

(async () => {
  await db.settle();
  assert(dom.onlineButtons.every((b) => !b.disabled), 'con Firebase, el online se habilita');
  assert.strictEqual(dom.q('#userbox').children.length, 1, 'se ofrece Ingresar / Registrarme');

  // --- sin cuenta: pide registrarse ---
  dom.onlineButtons[0].handlers.click();
  assert.strictEqual(dom.q('#tab-auth').hidden, false, 'sin cuenta se muestra el formulario');

  // usuario inválido y contraseña corta → mensajes de error
  dom.q('#authSwitch').handlers.click();                  // pasar a "crear cuenta"
  dom.q('#authUser').value = 'a'; dom.q('#authPass').value = '123456'; await submit();
  assert(/entre 3 y 16/.test(dom.q('#authMsg').textContent), 'valida el usuario');
  dom.q('#authUser').value = 'ana_ui'; dom.q('#authPass').value = '123'; await submit();
  assert(/al menos 6/.test(dom.q('#authMsg').textContent), 'valida la contraseña');
  dom.q('#authPass').value = '123456'; await submit();
  assert.strictEqual(dom.q('#authMsg').textContent, '', 'sin errores');
  assert.strictEqual(dom.q('#tab-auth').hidden, true, 'el formulario se cierra al registrarse');
  assert.strictEqual(dom.q('#pick').hidden, false, 'sigue con la selección de luchador online');
  assert(/online/.test(dom.q('#pickTitle').textContent));

  // --- partida 1: la persona busca primero → es anfitrión ---
  dom.q('#chars').children[0].handlers.click();           // elige a Kaito y entra a la cola
  await db.settle();
  assert.strictEqual(dom.q('#lobby').hidden, false, 'muestra la búsqueda');
  assert(/Buscando partida 1v1/.test(dom.q('#lobbyMsg').textContent));
  clock += 20;
  const bot = db.client('bot');
  let botRoom = null;
  Net.joinQueue(bot, { uid: 'uid-z-bot', name: 'robot', char: 2 }, '1v1', { onMatch: (id) => { botRoom = id; } });
  await db.settle(); await db.settle();
  assert(botRoom, 'el bot recibe sala');
  const room = await Net.loadRoom(bot, botRoom);
  assert.strictEqual(room.host, 'uid-a-ui', 'el que esperaba antes es anfitrión');
  const botClient = Net.createClient(bot, botRoom, room, 'uid-z-bot', { Game });
  let seen = 0, sawCountdown = false;
  dom.texts.length = 0;
  await run(150, () => {
    const v = botClient.view();
    if (v) { seen++; if (v.cd > 0) sawCountdown = true; }
    const me = v && v.fighters[1], foe = v && v.fighters[0];
    botClient.sendInput({ mx: 0, my: Math.sin(clock / 600), ax: foe ? foe.x : 0, ay: foe ? foe.y : 0, fire: true, dash: false, special: false });
  });
  assert.strictEqual(dom.q('#ui').hidden, true, 'la persona está jugando');
  assert(seen > 100, 'el cliente simulado recibió el estado');
  assert(sawCountdown, 'hubo cuenta regresiva');
  assert(dom.texts.some((t) => t === '¡VICTORIA!' || t === 'DERROTA'), 'se llegó a la pantalla de resultado');
  const botView = botClient.view();
  assert.strictEqual(botView.over, true);
  console.log('ok anfitrión: resultado en pantalla →', dom.texts.filter((t) => t === '¡VICTORIA!' || t === 'DERROTA').pop());
  dom.key('Escape');
  await db.settle(); await db.settle();
  assert.strictEqual(dom.q('#ui').hidden, false, 'Esc vuelve al menú');
  assert.strictEqual(db._get('rooms/' + botRoom), undefined, 'el anfitrión borra la sala');
  botClient.stop();

  // --- partida 2: el bot espera primero → el bot es anfitrión, la persona es cliente ---
  const botHandle = db.client('bot2');
  let bot2Room = null;
  Net.joinQueue(botHandle, { uid: 'uid-0-host', name: 'anfitrion', char: 1 }, '1v1', { onMatch: (id) => { bot2Room = id; } });
  await db.settle();
  clock += 20;
  dom.onlineButtons[0].handlers.click();                  // ya está con sesión iniciada
  assert.strictEqual(dom.q('#pick').hidden, false);
  dom.q('#chars').children[3].handlers.click();           // Mira
  await db.settle(); await db.settle();
  assert(bot2Room, 'el anfitrión simulado recibe sala');
  const room2 = await Net.loadRoom(botHandle, bot2Room);
  assert.strictEqual(room2.host, 'uid-0-host');
  const host = Net.createHost(botHandle, bot2Room, room2, 'uid-0-host', { Game });
  dom.texts.length = 0;
  await run(150, () => {
    const g = host.game, foe = g.fighters[1];
    host.tick({ mx: 0, my: Math.sin(clock / 500), ax: foe.x, ay: foe.y, fire: true, dash: false, special: false }, 1 / 60);
  });
  assert.strictEqual(dom.q('#c').hidden, false, 'la persona (cliente) está jugando');
  assert(host.game.over, 'la partida terminó');
  assert(dom.texts.some((t) => t === '¡VICTORIA!' || t === 'DERROTA'), 'el cliente ve el resultado');
  assert(dom.texts.some((t) => /anfitrion/.test(t)), 'el HUD muestra los nombres de los jugadores');
  const lastResult = dom.texts.filter((t) => t === '¡VICTORIA!' || t === 'DERROTA').pop();
  assert.strictEqual(lastResult, host.game.winner === 1 ? '¡VICTORIA!' : 'DERROTA', 'resultado coherente con el ganador');
  console.log('ok cliente: resultado en pantalla →', lastResult);
  dom.key('Enter');
  assert.strictEqual(dom.q('#ui').hidden, false, 'Enter vuelve al menú');

  // ================= amigos y salas privadas =================
  assert.strictEqual(dom.q('#createParty').disabled, false, 'con sesión se puede crear una sala');
  const brunoH = db.client('bruno'), bruno = { uid: 'uid-b-bruno', name: 'bruno' };
  Social.ensureProfile(brunoH, bruno);
  await db.settle();

  // --- agregar amigo desde la pestaña Amigos ---
  dom.tabButtons[1].handlers.click();
  assert.strictEqual(dom.q('#tab-friends').hidden, false);
  dom.q('#friendName').value = 'nadie';
  await dom.q('#friendForm').handlers.submit({ preventDefault() {} });
  assert(/No existe/.test(dom.q('#friendMsg').textContent), 'avisa si el usuario no existe');
  dom.q('#friendName').value = 'bruno';
  await dom.q('#friendForm').handlers.submit({ preventDefault() {} });
  assert(/Solicitud enviada/.test(dom.q('#friendMsg').textContent));
  assert(db._get('requests/uid-b-bruno/uid-a-ui'), 'la solicitud llegó a bruno');
  await Social.acceptRequest(brunoH, bruno, 'uid-a-ui', 'ana_ui');
  await db.settle(); await db.settle();
  assert.strictEqual(dom.q('#friendList').children.length, 1, 'bruno aparece en la lista de amigos');
  console.log('ok amigos en la interfaz');

  // --- sala: crear, invitar, bruno entra, empezar, jugar, volver a la sala ---
  dom.tabButtons[0].handlers.click();
  dom.q('#createParty').handlers.click();
  await db.settle(); await db.settle();
  const partyId = Object.keys(db._get('parties') || {})[0];
  assert(partyId, 'se creó la sala');
  assert.strictEqual(dom.q('#party').hidden, false, 'se muestra la sala');
  assert.strictEqual(dom.q('#modes').hidden, true);
  assert.strictEqual(dom.q('#partyStart').disabled, true, 'no se puede empezar solo');
  const row = dom.q('#partyFriends').children[0];
  assert(row, 'bruno aparece para invitar');
  row.children[1].handlers.click();                       // Invitar
  await db.settle();
  assert.strictEqual(db._get('invites/uid-b-bruno/uid-a-ui').party, partyId, 'la invitación llegó');
  let brunoRoom = null;
  Net.watchMatch(brunoH, 'uid-b-bruno', (id) => { brunoRoom = id; });
  await Social.joinParty(brunoH, bruno, partyId, 2);
  await db.settle(); await db.settle();
  assert.strictEqual(dom.q('#partyMembers').children.length, 2, 'bruno aparece en la sala');
  assert.strictEqual(dom.q('#partyStart').disabled, false, 'ahora sí se puede empezar');
  dom.q('#partyStart').handlers.click();
  await db.settle(); await db.settle();
  assert(brunoRoom, 'bruno recibe la partida');
  const pRoom = await Net.loadRoom(brunoH, brunoRoom);
  assert.strictEqual(pRoom.host, 'uid-a-ui');
  const pClient = Net.createClient(brunoH, brunoRoom, pRoom, 'uid-b-bruno', { Game });
  dom.texts.length = 0;
  await run(150, () => {
    const v = pClient.view(), foe = v && v.fighters[0];
    pClient.sendInput({ mx: 0, my: 0, ax: foe ? foe.x : 0, ay: foe ? foe.y : 0, fire: true, dash: false, special: false });
  });
  assert(dom.texts.some((t) => t === '¡VICTORIA!' || t === 'DERROTA'), 'se jugó la partida de la sala');
  pClient.stop();
  dom.key('Enter');
  assert.strictEqual(dom.q('#ui').hidden, false);
  assert.strictEqual(dom.q('#party').hidden, false, 'después de la partida se vuelve a la sala');
  console.log('ok sala privada (UI anfitrión)');

  // el anfitrión sale: la sala se cierra
  dom.q('#partyLeave').handlers.click();
  await db.settle(); await db.settle();
  assert.strictEqual(db._get('parties/' + partyId), undefined, 'la sala se cerró');
  assert.strictEqual(dom.q('#party').hidden, true); assert.strictEqual(dom.q('#modes').hidden, false);

  // --- invitación recibida: bruno crea una sala e invita a la persona ---
  const party2 = await Social.createParty(brunoH, bruno, 1);
  await Social.sendInvite(brunoH, bruno, 'uid-a-ui', party2);
  await db.settle(); await db.settle();
  assert.strictEqual(dom.q('#invites').children.length, 1, 'aparece el aviso de invitación');
  dom.q('#invites').children[0].children[1].children[0].handlers.click();   // Unirse
  await db.settle(); await db.settle(); await db.settle();
  assert(db._get('parties/' + party2 + '/members/uid-a-ui'), 'la persona entró a la sala de bruno');
  assert.strictEqual(dom.q('#party').hidden, false);
  assert.strictEqual(dom.q('#partyStart').hidden, true, 'un invitado no puede empezar');
  assert.strictEqual(dom.q('#invites').children.length, 0, 'la invitación se limpia');
  await Social.setMode(brunoH, party2, '2v2');            // 2v2: bruno + la persona contra 2 CPU? (equipos opuestos → 1+CPU vs 1+CPU)
  await db.settle();
  const startedRoom = await Social.startParty(brunoH, party2, db._get('parties/' + party2), { rng: () => 0.2 });
  await db.settle(); await db.settle();
  const sRoom = await Net.loadRoom(brunoH, startedRoom);
  assert.strictEqual(sRoom.players.length, 4); assert.strictEqual(sRoom.players.filter((p) => p.cpu).length, 2);
  const sHost = Net.createHost(brunoH, startedRoom, sRoom, 'uid-b-bruno', { Game });
  dom.texts.length = 0;
  await run(170, () => {
    const g = sHost.game, me = g.fighters.findIndex((f, i) => sRoom.players[i].uid === 'uid-b-bruno');
    const foe = g.fighters.find((f) => f.team !== g.fighters[me].team && f.hp > 0) || g.fighters[me];
    sHost.tick({ mx: 0, my: 0, ax: foe.x, ay: foe.y, fire: true, dash: false, special: false }, 1 / 60);
  });
  assert(sHost.game.over, 'la partida 2v2 con CPU terminó');
  assert(dom.texts.some((t) => t === '¡VICTORIA!' || t === 'DERROTA'), 'la persona ve el resultado');
  assert(dom.texts.some((t) => /CPU/.test(t)), 'el HUD muestra a los CPU');
  dom.key('Escape');
  assert.strictEqual(dom.q('#party').hidden, false, 'vuelve a la sala de bruno');
  // bruno cierra la sala: la persona vuelve al inicio con aviso
  await Social.leaveParty(brunoH, bruno, party2, true);
  await db.settle(); await db.settle();
  assert.strictEqual(dom.q('#party').hidden, true);
  assert(/La sala se cerró/.test(dom.q('#menuMsg').textContent), 'avisa que la sala se cerró');
  sHost.stop();
  console.log('ok sala privada (UI invitado)');

  // --- cancelar una búsqueda y cerrar sesión ---
  dom.onlineButtons[1].handlers.click();
  dom.q('#chars').children[0].handlers.click();
  await db.settle();
  assert(db._get('queue/2v2/uid-a-ui'), 'está en la cola 2v2');
  dom.q('#lobbyCancel').handlers.click();
  await db.settle();
  assert.strictEqual(db._get('queue/2v2/uid-a-ui'), undefined, 'cancelar saca de la cola');
  await fakeAuth.signOut();
  assert.strictEqual(dom.q('#userbox').children.length, 1, 'al salir vuelve el botón de ingresar');
  console.log('OK');
})().catch((e) => { console.error(e); process.exit(1); });
