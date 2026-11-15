// Menú (HTML), cuentas, partidas online, render, input y bucle principal (navegador).
(function () {
  const { W, H, FR, CHARS, BEAM_COST, makeRoster, createGame, step, aiInput } = window.Game;
  const Auth = window.Auth, Net = window.Net, Social = window.Social, Sprites = window.Sprites;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#c'), ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false, right: false };
  let scene = 'menu', game = null, aiMem = [], fx = [], shake = 0, last = 0, acc = 0;
  let pendingMode = null, pendingOnline = false, authMode = 'login', authBusy = false;
  let online = null;   // { role: 'host'|'client', host|client, myIdx }
  let search = null;   // búsqueda de partida en curso
  let youId = 0;       // índice de mi luchador
  let session = null;  // amigos, solicitudes, invitaciones y presencia del jugador con sesión
  let party = null;    // sala privada en la que estoy: { id, isHost, data, unwatch, stopMatch }
  let myChar = 0;      // luchador elegido para las salas privadas

  // ---------- pestañas ----------
  function showTab(name) {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $('#tab-play').hidden = name !== 'play';
    $('#tab-friends').hidden = name !== 'friends';
    $('#tab-news').hidden = name !== 'news';
    $('#tab-auth').hidden = name !== 'auth';
    if (name === 'friends') renderFriends();
  }
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { cancelSearch(); showTab(b.dataset.tab); }));

  function renderNews() {
    const box = $('#news');
    box.textContent = '';
    (window.NEWS || []).forEach((n) => {
      const e = document.createElement('article'); e.className = 'entry';
      const t = document.createElement('time'); t.textContent = n.date;
      const h = document.createElement('h3'); h.textContent = n.title;
      const ul = document.createElement('ul');
      n.items.forEach((it) => { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); });
      e.append(t, h, ul); box.appendChild(e);
    });
  }

  function setMsg(text) { $('#menuMsg').textContent = text || ''; }

  // ---------- selector de luchador ----------
  function openPicker(mode, isOnline) {
    pendingMode = mode; pendingOnline = !!isOnline; setMsg('');
    const label = (isOnline ? ' online' : ' contra la computadora');
    $('#pickTitle').textContent = mode + label + ' · Elegí tu luchador' + (mode === '2v2' && !isOnline ? ' (tu aliado y los rivales los asigna el juego)' : '');
    const box = $('#chars'); box.textContent = '';
    CHARS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'char'; b.style.setProperty('--c', c.color);
      const dot = document.createElement('div'); dot.className = 'dot';
      const th = Sprites && Sprites.thumb(c);
      if (th) { // sprite del personaje en lugar del círculo de color
        dot.className = 'thumb';
        dot.style.width = '72px'; dot.style.height = Math.round(72 * th.frameH / th.frameW) + 'px';
        dot.style.backgroundImage = 'url(' + th.src + ')';
        dot.style.backgroundSize = (th.frames * 100) + '% 100%';
      }
      const n = document.createElement('b'); n.textContent = (i + 1) + '. ' + c.name;
      const s1 = document.createElement('span'); s1.textContent = 'Vida ' + c.hp + ' · Vel ' + c.speed + ' · Daño ' + c.dmg;
      const s2 = document.createElement('span'); s2.textContent = c.forms.join(' → ');
      b.append(dot, n, s1, s2);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    $('#modes').hidden = true; $('#pick').hidden = false; $('#lobby').hidden = true; $('#party').hidden = true;
  }
  // Pantalla inicial de Jugar: los modos, o la sala privada si estoy en una.
  function closePicker() {
    pendingMode = null; pendingOnline = false;
    $('#modes').hidden = !!party; $('#party').hidden = !party;
    $('#pick').hidden = true; $('#lobby').hidden = true;
    if (party) renderParty();
  }
  function choose(i) { if (pendingOnline) startSearch(pendingMode, i); else start(pendingMode, i); }

  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => openPicker(b.dataset.mode, false)));
  $('#back').addEventListener('click', closePicker);

  // ---------- cuentas ----------
  function refreshUser() {
    const box = $('#userbox'); box.textContent = '';
    const u = Auth && Auth.current();
    if (u) {
      const who = document.createElement('span'); who.textContent = 'Jugador: ';
      const nm = document.createElement('b'); nm.textContent = u.name; who.appendChild(nm);
      const out = document.createElement('button'); out.className = 'ghost'; out.style.margin = '0'; out.textContent = 'Salir';
      out.addEventListener('click', () => { Auth.logout(); });
      box.append(who, out);
    } else if (Auth && Auth.available) {
      const b = document.createElement('button'); b.className = 'ghost'; b.style.margin = '0'; b.textContent = 'Ingresar / Registrarme';
      b.addEventListener('click', () => showAuth(null));
      box.appendChild(b);
    }
  }
  function setAuthMode(m) {
    authMode = m;
    $('#authTitle').textContent = m === 'login' ? 'Ingresar' : 'Crear cuenta';
    $('#authSubmit').textContent = m === 'login' ? 'Ingresar' : 'Crear cuenta';
    $('#authSwitch').textContent = m === 'login' ? '¿No tenés cuenta? Crear una' : '¿Ya tenés cuenta? Ingresar';
    $('#authMsg').textContent = '';
  }
  function showAuth(modeAfter) {
    pendingOnline = !!modeAfter; pendingMode = modeAfter;
    setAuthMode('login'); showTab('auth');
  }
  $('#authSwitch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  $('#authCancel').addEventListener('click', () => { closePicker(); showTab('play'); });
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (authBusy) return;
    authBusy = true; $('#authSubmit').disabled = true; $('#authMsg').textContent = '';
    try {
      const u = $('#authUser').value, p = $('#authPass').value;
      if (authMode === 'login') await Auth.login(u, p); else await Auth.register(u, p);
      $('#authPass').value = '';
      const mode = pendingMode, wasOnline = pendingOnline;
      showTab('play');
      if (wasOnline && mode) openPicker(mode, true); else closePicker();
    } catch (err) {
      $('#authMsg').textContent = err.message || 'No se pudo completar.';
    } finally { authBusy = false; $('#authSubmit').disabled = false; }
  });

  document.querySelectorAll('[data-online]').forEach((b) => b.addEventListener('click', () => {
    const mode = b.dataset.online;
    if (!Auth.current()) showAuth(mode); else openPicker(mode, true);
  }));
  function refreshOnlineButtons() {
    document.querySelectorAll('[data-online]').forEach((b) => {
      b.disabled = !(Auth && Auth.available);
      b.title = b.disabled ? 'El modo online no está disponible ahora (no se pudo conectar con Firebase).' : '';
    });
  }
  if (Auth) {
    Auth.init();
    Auth.onChange((u) => { refreshUser(); if (u) startSession(u); else stopSession(); });
  }
  refreshOnlineButtons(); refreshUser();

  // ---------- amigos, invitaciones y salas privadas ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const mini = (text, fn, cls) => { const b = el('button', 'mini' + (cls ? ' ' + cls : ''), text); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const friendEntries = () => Object.entries((session && session.friends) || {}).sort((a, b) => (a[1].name < b[1].name ? -1 : 1));
  const partyOf = () => (party && party.data) || null;

  function startSession(user) {
    stopSession();
    const db = Auth.db();
    session = { user, unsubs: [], presUnsubs: {}, friends: {}, requests: {}, invites: {}, presence: {}, profile: Social.ensureProfile(db, user) };
    session.profile.ready.catch(() => {});
    const w = (path, fn) => session.unsubs.push(Social.watch(db, path, fn));
    w('friends/' + user.uid, (v) => { session.friends = v || {}; syncPresence(); renderFriends(); renderParty(); });
    w('requests/' + user.uid, (v) => { session.requests = v || {}; renderFriends(); });
    w('invites/' + user.uid, (v) => { session.invites = v || {}; renderInvites(); });
    $('#createParty').disabled = false;
    renderFriends(); renderInvites();
  }
  function stopSession() {
    if (party) leaveParty(false);
    if (!session) return;
    session.unsubs.forEach((f) => f());
    Object.values(session.presUnsubs).forEach((f) => f());
    session.profile.stop();
    session = null;
    $('#createParty').disabled = true;
    renderFriends(); renderInvites();
    if (scene === 'menu') closePicker();
  }
  function syncPresence() {
    const db = Auth.db(), ids = friendEntries().map(([uid]) => uid);
    ids.forEach((uid) => {
      if (session.presUnsubs[uid]) return;
      session.presUnsubs[uid] = Social.watch(db, 'presence/' + uid, (v) => {
        session.presence[uid] = !!v; renderFriends(); renderParty();
      });
    });
    Object.keys(session.presUnsubs).forEach((uid) => {
      if (!ids.includes(uid)) { session.presUnsubs[uid](); delete session.presUnsubs[uid]; delete session.presence[uid]; }
    });
  }

  function renderInvites() {
    const box = $('#invites'); box.textContent = '';
    if (!session) return;
    Object.entries(session.invites).forEach(([fromUid, inv]) => {
      const row = el('div', 'invite');
      row.appendChild(el('span', '', inv.name + ' te invitó a su sala'));
      const btns = el('span', 'btns');
      btns.append(
        mini('Unirse', () => acceptInvite(fromUid, inv), 'on'),
        mini('Rechazar', () => Social.clearInvite(Auth.db(), session.user, fromUid)),
      );
      row.appendChild(btns); box.appendChild(row);
    });
  }
  async function acceptInvite(fromUid, inv) {
    const db = Auth.db(), u = session.user;
    try {
      if (party) await leaveParty(false);
      await Social.joinParty(db, u, inv.party, myChar);
      if (!session) return;
      await Social.clearInvite(db, u, fromUid);
      enterParty(inv.party, false);
      showTab('play');
    } catch (e) {
      Social.clearInvite(db, u, fromUid);
      setMsg(e.message || 'No se pudo entrar a la sala.'); showTab('play');
    }
  }

  function renderFriends() {
    const fl = $('#friendList'), rl = $('#reqList');
    fl.textContent = ''; rl.textContent = '';
    if (!session) {
      fl.appendChild(el('p', 'empty', 'Ingresá con tu cuenta para ver y agregar amigos.'));
      rl.appendChild(el('p', 'empty', '—'));
      return;
    }
    const reqs = Object.entries(session.requests);
    if (!reqs.length) rl.appendChild(el('p', 'empty', 'No tenés solicitudes pendientes.'));
    reqs.forEach(([uid, r]) => {
      const row = el('div', 'row'); row.appendChild(el('span', 'who', r.name));
      const btns = el('span', 'btns');
      btns.append(
        mini('Aceptar', () => Social.acceptRequest(Auth.db(), session.user, uid, r.name), 'on'),
        mini('Rechazar', () => Social.declineRequest(Auth.db(), session.user, uid)),
      );
      row.appendChild(btns); rl.appendChild(row);
    });
    const fr = friendEntries();
    if (!fr.length) fl.appendChild(el('p', 'empty', 'Todavía no agregaste amigos.'));
    fr.forEach(([uid, f]) => {
      const row = el('div', 'row');
      const who = el('span', 'who');
      who.append(el('span', 'pres' + (session.presence[uid] ? ' on' : '')), el('span', '', f.name + (session.presence[uid] ? '' : ' (desconectado)')));
      const btns = el('span', 'btns');
      if (party && party.isHost) btns.appendChild(mini('Invitar a la sala', () => invite(uid, f.name)));
      btns.appendChild(mini('Eliminar', () => Social.removeFriend(Auth.db(), session.user, uid)));
      row.append(who, btns); fl.appendChild(row);
    });
  }
  $('#friendForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#friendMsg'); msg.textContent = '';
    if (!session) { msg.textContent = 'Ingresá con tu cuenta primero.'; return; }
    try {
      const r = await Social.sendRequest(Auth.db(), session.user, $('#friendName').value);
      $('#friendName').value = '';
      msg.textContent = r === 'accepted' ? '¡Ya son amigos!' : 'Solicitud enviada. Cuando la acepte, aparece en tu lista.';
    } catch (err) { msg.textContent = err.message || 'No se pudo enviar la solicitud.'; }
  });

  // --- sala privada ---
  function enterParty(id, isHost) {
    const db = Auth.db(), uid = session.user.uid;
    party = { id, isHost, data: null };
    party.unwatch = Social.watch(db, 'parties/' + id, (v) => {
      if (!party || party.id !== id) return;
      if (!v || !v.members || !v.members[uid]) { // se cerró la sala o me sacaron
        const closed = !v;
        leaveParty(true); toMenu(closed ? 'La sala se cerró.' : 'Te sacaron de la sala.'); return;
      }
      party.data = v; renderParty(); renderFriends();
    });
    party.stopMatch = Net.watchMatch(db, uid, (roomId) => enterOnline(roomId));
    closePicker();
  }
  // Sale de la sala: deja de escuchar y avisa a la base de datos (salvo que la sala ya no exista).
  // La pantalla la actualiza quien llama (toMenu / closePicker).
  async function leaveParty(alreadyGone) {
    if (!party) return;
    const p = party; party = null;
    p.unwatch(); p.stopMatch();
    if (!alreadyGone && session) {
      try { await Social.leaveParty(Auth.db(), session.user, p.id, p.isHost); } catch (e) { /* ignorar */ }
    }
  }
  async function createRoom() {
    if (!session) { showAuth(null); return; }
    try {
      const id = await Social.createParty(Auth.db(), session.user, myChar);
      enterParty(id, true);
    } catch (e) { setMsg(e.message || 'No se pudo crear la sala.'); }
  }
  async function invite(uid, name) {
    if (!party) return;
    try { await Social.sendInvite(Auth.db(), session.user, uid, party.id); $('#partyMsg').textContent = 'Invitación enviada a ' + name + '.'; }
    catch (e) { $('#partyMsg').textContent = 'No se pudo invitar: ' + (e.message || e); }
  }

  function renderParty() {
    const d = partyOf();
    if (!party || !d) return;
    const db = Auth.db(), me = session.user, isHost = party.isHost;
    $('#partyTitle').textContent = 'Sala de ' + d.hostName;
    document.querySelectorAll('[data-pmode]').forEach((b) => {
      b.classList.toggle('on', b.dataset.pmode === d.mode);
      b.disabled = !isHost;
    });
    const box = $('#partyMembers'); box.textContent = '';
    Object.entries(d.members).sort((a, b) => a[1].t - b[1].t).forEach(([uid, m]) => {
      const row = el('div', 'row'), mine = uid === me.uid;
      row.appendChild(el('span', 'who', (uid === d.host ? '👑 ' : '') + m.name + (mine ? ' (vos)' : '')));
      const btns = el('span', 'btns');
      if (mine) {
        const sel = document.createElement('select');
        CHARS.forEach((c, i) => { const o = el('option', '', c.name); o.value = String(i); sel.appendChild(o); });
        sel.value = String(m.char);
        sel.addEventListener('change', () => { myChar = +sel.value; Social.setMember(db, party.id, uid, { char: myChar }); });
        btns.appendChild(sel);
      } else btns.appendChild(el('span', 'empty', CHARS[m.char].name));
      const tb = mini('Equipo ' + (m.team === 1 ? '2' : '1'), () => { if (mine) Social.setMember(db, party.id, uid, { team: m.team === 1 ? 0 : 1 }); }, 't' + (m.team === 1 ? 1 : 0));
      tb.disabled = !mine; btns.appendChild(tb);
      if (isHost && !mine) btns.appendChild(mini('Sacar', () => Social.kick(db, party.id, uid)));
      row.appendChild(btns); box.appendChild(row);
    });
    // amigos para invitar (solo el anfitrión)
    $('#partyInviteBox').hidden = !isHost;
    const pf = $('#partyFriends'); pf.textContent = '';
    if (isHost) {
      const fr = friendEntries().filter(([uid]) => !d.members[uid]);
      if (!fr.length) pf.appendChild(el('p', 'empty', 'No hay amigos para invitar. Agregalos en la pestaña Amigos.'));
      fr.forEach(([uid, f]) => {
        const row = el('div', 'row'), on = !!session.presence[uid];
        const who = el('span', 'who'); who.append(el('span', 'pres' + (on ? ' on' : '')), el('span', '', f.name));
        const b = mini('Invitar', () => invite(uid, f.name), 'on'); b.disabled = !on; b.title = on ? '' : 'Tu amigo no está conectado';
        row.append(who, b); pf.appendChild(row);
      });
    }
    const issue = Social.partyIssue(d);
    $('#partyStart').hidden = !isHost; $('#partyStart').disabled = !!issue;
    if (!$('#partyMsg').textContent || /^(Hace falta|En 1v1|En 2v2)/.test($('#partyMsg').textContent)) $('#partyMsg').textContent = issue || '';
  }
  document.querySelectorAll('[data-pmode]').forEach((b) => b.addEventListener('click', () => { if (party && party.isHost) Social.setMode(Auth.db(), party.id, b.dataset.pmode); }));
  $('#partyStart').addEventListener('click', async () => {
    if (!party || !party.data) return;
    $('#partyMsg').textContent = '';
    try { await Social.startParty(Auth.db(), party.id, party.data); }
    catch (e) { $('#partyMsg').textContent = e.message || 'No se pudo empezar.'; }
  });
  $('#partyLeave').addEventListener('click', async () => { await leaveParty(false); toMenu(); });
  $('#createParty').addEventListener('click', createRoom);

  // ---------- búsqueda de partida online ----------
  function setLobby(text) { $('#lobbyMsg').textContent = text; }
  function cancelSearch() { if (search) { search.cancel(); search = null; } }
  $('#lobbyCancel').addEventListener('click', () => { cancelSearch(); closePicker(); });

  function startSearch(mode, charIdx) {
    const u = Auth.current(), db = Auth.db();
    if (!u) { showAuth(mode); return; }
    $('#pick').hidden = true; $('#modes').hidden = true; $('#lobby').hidden = false;
    setLobby('Buscando partida ' + mode + '…');
    search = Net.joinQueue(db, { uid: u.uid, name: u.name, char: charIdx }, mode, {
      onProgress: (n, need) => setLobby('Buscando partida ' + mode + '… ' + n + '/' + need + ' jugadores'),
      onMatch: (roomId) => { search = null; enterOnline(roomId); },
      onError: (e) => { setLobby('No se pudo buscar partida: ' + (e && e.message ? e.message : e)); },
    });
  }

  function enterOnline(roomId) {
    const u = Auth.current(), db = Auth.db();
    setLobby('Entrando a la partida…');
    Net.loadRoom(db, roomId).then((room) => {
      if (!room) throw new Error('la sala ya no existe');
      const players = Object.values(room.players);
      const opts = { Game: window.Game };
      online = room.host === u.uid
        ? { role: 'host', host: Net.createHost(db, roomId, room, u.uid, opts) }
        : { role: 'client', client: Net.createClient(db, roomId, room, u.uid, opts) };
      online.myIdx = players.findIndex((p) => p.uid === u.uid);
      youId = online.myIdx;
      game = online.role === 'host' ? online.host.game : null;
      fx = []; shake = 0; mouse.down = mouse.right = false;
      scene = 'play';
      $('#ui').hidden = true; canvas.hidden = false;
    }).catch((e) => {
      const text = 'No se pudo entrar a la partida: ' + (e && e.message ? e.message : e);
      setLobby(text); setMsg(text);
    });
  }

  function leaveOnline() {
    if (!online) return;
    if (online.role === 'host') online.host.stop(); else online.client.stop();
    online = null;
  }

  // ---------- escenas ----------
  function toMenu(msg) {
    cancelSearch(); leaveOnline();
    scene = 'menu'; game = null; youId = 0;
    $('#ui').hidden = false; canvas.hidden = true;
    closePicker(); showTab('play'); setMsg(msg || '');
  }

  function start(mode, charIndex) {
    game = createGame(makeRoster(mode, charIndex));
    aiMem = game.fighters.map(() => ({}));
    youId = 0; online = null;
    fx = []; shake = 0; mouse.down = mouse.right = false;
    scene = 'play';
    $('#ui').hidden = true; canvas.hidden = false;
  }

  // ---------- entrada ----------
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * W;
    mouse.y = ((e.clientY - r.top) / r.height) * H;
  }
  addEventListener('keydown', (e) => {
    if (scene !== 'menu' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    const picking = scene === 'menu' && pendingMode && !$('#pick').hidden;
    if (picking && e.code >= 'Digit1' && e.code <= 'Digit9' && +e.code.slice(5) <= CHARS.length) choose(+e.code.slice(5) - 1);
    if ((scene === 'play' || scene === 'over') && e.code === 'Escape') toMenu();
    if (scene === 'over' && e.code === 'Enter') toMenu();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('mousemove', toCanvas);
  canvas.addEventListener('mousedown', (e) => {
    toCanvas(e);
    if (scene === 'over') { toMenu(); return; }
    if (e.button === 2) mouse.right = true; else mouse.down = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 2) mouse.right = false; else mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function playerInput() {
    const k = (c) => keys.has(c);
    return {
      mx: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
      my: (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0),
      ax: mouse.x, ay: mouse.y,
      fire: mouse.down || k('KeyJ'),
      dash: k('Space') || k('ShiftLeft'),
      special: mouse.right || k('KeyE') || k('KeyK'),
    };
  }

  // ---------- efectos ----------
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 60 + Math.random() * 220;
      fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color });
    }
  }
  function handleEvents(list) {
    for (const e of list) {
      if (e.type === 'hit') { shake = Math.min(14, shake + 3 + e.amt * 0.3); burst(e.x, e.y, '#fff', 8); }
      if (e.type === 'evolve' && game && game.fighters[e.id]) { shake = 16; burst(e.x, e.y, game.fighters[e.id].base.color, 40); }
      if (e.type === 'clash') { shake = 10; burst(e.x, e.y, '#fff', 30); }
      if (e.type === 'down') { shake = 14; burst(e.x, e.y, '#f87171', 40); }
      if (e.type === 'dash') burst(e.x, e.y, '#9ef', 6);
    }
  }

  // ---------- actualización ----------
  function update(dt) {
    if (scene !== 'play' || !game) return;
    if (online && online.role === 'host') {
      online.host.tick(playerInput(), dt);
    } else if (!online) {
      const inputs = game.fighters.map((_, i) => (i === youId ? playerInput() : aiInput(game, i, aiMem[i])));
      step(game, inputs, dt);
    } else return;
    handleEvents(game.events); game.events.length = 0;
    if (game.over) scene = 'over';
  }

  // El cliente online no simula: manda sus controles y dibuja lo que publica el anfitrión.
  function clientFrame() {
    if (!online || online.role !== 'client' || (scene !== 'play' && scene !== 'over')) return;
    const c = online.client;
    if (scene === 'play') c.sendInput(playerInput());
    const v = c.view();
    if (v) { game = v; handleEvents(c.takeEvents()); if (v.over && scene === 'play') scene = 'over'; }
    if (scene === 'play' && c.hostLost()) toMenu('Se perdió la conexión con el anfitrión de la partida.');
  }

  // ---------- dibujo ----------
  const TEAM_COLOR = ['#4ade80', '#f87171'];
  const moveMem = {}; // última posición de cada luchador, para elegir la animación de correr

  function drawFighter(f) {
    const col = f.base.color;
    ctx.save(); ctx.translate(f.x, f.y);
    ctx.strokeStyle = TEAM_COLOR[f.team]; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, FR + 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    const auraR = FR + 6 + f.form * 6 + Math.sin(game.time * 12) * 2;
    if (f.form > 0 || f.dashT > 0) {
      ctx.fillStyle = col + '55'; ctx.beginPath(); ctx.arc(0, 0, auraR + 6, 0, 7); ctx.fill();
    }
    ctx.restore();
    let m = moveMem[f.id];
    if (!m || m.g !== game) m = moveMem[f.id] = { g: game, x: f.x, y: f.y, moving: false };
    const moved = Math.hypot(f.x - m.x, f.y - m.y) > 0.4;
    m.moving = moved || (m.moving && Math.hypot(f.x - m.x, f.y - m.y) > 0.05); m.x = f.x; m.y = f.y;
    if (Sprites && Sprites.drawFighter(ctx, f, m.moving, game.time)) {
      if (f.id === youId) marker(f);
      return;
    }
    ctx.save(); ctx.translate(f.x, f.y);
    ctx.fillStyle = f.hurtT > 0 ? '#fff' : col;
    ctx.beginPath(); ctx.arc(0, 0, FR, 0, 7); ctx.fill();
    ctx.rotate(f.face);
    const spikes = 3 + f.form * 2;
    ctx.fillStyle = f.form === 2 ? '#ffe45e' : col;
    for (let i = 0; i < spikes; i++) {
      const a = Math.PI + (i - (spikes - 1) / 2) * 0.45;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.2) * FR, Math.sin(a - 0.2) * FR);
      ctx.lineTo(Math.cos(a) * (FR + 14 + f.form * 4), Math.sin(a) * (FR + 14 + f.form * 4));
      ctx.lineTo(Math.cos(a + 0.2) * FR, Math.sin(a + 0.2) * FR);
      ctx.fill();
    }
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(8, -5, 3, 0, 7); ctx.arc(8, 5, 3, 0, 7); ctx.fill();
    ctx.restore();
    if (f.id === youId) marker(f);
  }
  function marker(f) { // marca del jugador
    ctx.fillStyle = '#fff'; ctx.beginPath();
    ctx.moveTo(f.x - 7, f.y - FR - 30); ctx.lineTo(f.x + 7, f.y - FR - 30); ctx.lineTo(f.x, f.y - FR - 20); ctx.fill();
  }

  function bar(x, y, w, h, v, max, color, right) {
    ctx.fillStyle = '#0008'; ctx.fillRect(x, y, w, h);
    const ww = (w * Math.max(0, v)) / max;
    ctx.fillStyle = color; ctx.fillRect(right ? x + w - ww : x, y, ww, h);
    ctx.strokeStyle = '#fff6'; ctx.strokeRect(x, y, w, h);
  }

  function hud() {
    const idx = [0, 0];
    game.fighters.forEach((f) => {
      const k = idx[f.team]++, right = f.team === 1;
      const x = right ? W - 300 : 20, y = 14 + k * 74;
      const dead = f.hp <= 0;
      ctx.globalAlpha = dead ? 0.4 : 1;
      bar(x, y, 280, 16, f.hp, f.maxHp, '#4ade80', right);
      bar(x, y + 20, 280, 7, f.energy, 100, f.energy >= f.base.beam.cost ? '#facc15' : '#a16207', right);
      bar(x, y + 31, 280, 5, f.form === 2 ? 100 : f.power, 100, '#f472b6', right);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = right ? 'right' : 'left';
      const who = f.name ? f.name + ' (' + f.base.name + ')' : f.base.name;
      ctx.fillText(who + ' · ' + f.base.forms[f.form] + (f.id === youId ? ' · vos' : '') + (dead ? ' ✕' : ''), right ? W - 20 : 20, y + 52);
      ctx.globalAlpha = 1;
    });
  }

  function countdown() {
    if (!online) return 0;
    return online.role === 'host' ? online.host.countdown() : (game && game.cd) || 0;
  }

  function render() {
    if (scene === 'menu') return;
    ctx.save();
    ctx.fillStyle = '#12141c'; ctx.fillRect(0, 0, W, H);
    if (!game) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 28px sans-serif';
      ctx.fillText('Conectando con la partida…', W / 2, H / 2);
      ctx.restore(); return;
    }
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.strokeStyle = '#ffffff10';
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    game.fighters.forEach((f) => { if (f.hp > 0) drawFighter(f); });
    for (const p of game.shots) {
      if (Sprites && Sprites.drawShot(ctx, { ...p, a: p.a !== undefined ? p.a : Math.atan2(p.vy, p.vx) }, game.fighters[p.owner].base, game.time)) continue;
      ctx.fillStyle = game.fighters[p.owner].base.color;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = p.type === 'beam' ? 30 : 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const p of fx) { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }
    ctx.globalAlpha = 1;
    if (game.clash) {
      const c = game.clash, tot = (c.push[c.a] + c.push[c.b]) || 1;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(c.a === youId || c.b === youId ? '¡CHOQUE! Tocá J / click rápido' : '¡Choque de rayos!', W / 2, H / 2 - 60);
      bar(W / 2 - 200, H / 2 - 40, 400, 16, c.push[c.a], tot, game.fighters[c.a].base.color, false);
    }
    ctx.strokeStyle = '#fff9'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 8, 0, 7); ctx.stroke();
    hud();
    const cd = countdown();
    if (cd > 0 && scene === 'play') {
      ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 120px sans-serif';
      ctx.fillText(String(cd), W / 2, H / 2 + 30);
      ctx.font = '22px sans-serif'; ctx.fillText('¡Preparate!', W / 2, H / 2 + 80);
    }
    if (scene === 'over') {
      const mine = game.fighters[youId] ? game.fighters[youId].team : 0;
      ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 56px sans-serif';
      ctx.fillText(game.winner === mine ? '¡VICTORIA!' : 'DERROTA', W / 2, H / 2);
      ctx.font = '20px sans-serif'; ctx.fillText('Enter, Esc o click para volver al menú', W / 2, H / 2 + 44);
    }
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t; acc += dt;
    while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60; }
    clientFrame();
    shake *= 0.9;
    for (const p of fx) { p.x += p.vx / 60; p.y += p.vy / 60; p.life -= 1 / 60; }
    fx = fx.filter((p) => p.life > 0);
    render();
    requestAnimationFrame(frame);
  }

  renderNews();
  requestAnimationFrame(frame);
})();
