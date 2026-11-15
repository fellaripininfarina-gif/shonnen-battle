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
window.Game = Game; window.Auth = require('../src/auth.js'); window.Net = Net;
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
