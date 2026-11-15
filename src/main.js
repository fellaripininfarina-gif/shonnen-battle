// Menú (HTML), cuentas, partidas online, render, input y bucle principal (navegador).
(function () {
  const { W, H, FR, CHARS, BEAM_COST, makeRoster, createGame, step, aiInput } = window.Game;
  const Auth = window.Auth, Net = window.Net;
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

  // ---------- pestañas ----------
  function showTab(name) {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $('#tab-play').hidden = name !== 'play';
    $('#tab-news').hidden = name !== 'news';
    $('#tab-auth').hidden = name !== 'auth';
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
      const n = document.createElement('b'); n.textContent = (i + 1) + '. ' + c.name;
      const s1 = document.createElement('span'); s1.textContent = 'Vida ' + c.hp + ' · Vel ' + c.speed + ' · Daño ' + c.dmg;
      const s2 = document.createElement('span'); s2.textContent = c.forms.join(' → ');
      b.append(dot, n, s1, s2);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    $('#modes').hidden = true; $('#pick').hidden = false; $('#lobby').hidden = true;
  }
  function closePicker() {
    pendingMode = null; pendingOnline = false;
    $('#modes').hidden = false; $('#pick').hidden = true; $('#lobby').hidden = true;
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
  if (Auth) { Auth.init(); Auth.onChange(() => { refreshUser(); }); }
  refreshOnlineButtons(); refreshUser();

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
    }).catch((e) => setLobby('No se pudo entrar a la partida: ' + (e && e.message ? e.message : e)));
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
    if (picking && e.code >= 'Digit1' && e.code <= 'Digit4') choose(+e.code.slice(5) - 1);
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

  function drawFighter(f) {
    const col = f.base.color;
    ctx.save(); ctx.translate(f.x, f.y);
    ctx.strokeStyle = TEAM_COLOR[f.team]; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, FR + 4, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
    const auraR = FR + 6 + f.form * 6 + Math.sin(game.time * 12) * 2;
    if (f.form > 0 || f.dashT > 0) {
      ctx.fillStyle = col + '55'; ctx.beginPath(); ctx.arc(0, 0, auraR + 6, 0, 7); ctx.fill();
    }
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
    if (f.id === youId) { // marca del jugador
      ctx.fillStyle = '#fff'; ctx.beginPath();
      ctx.moveTo(f.x - 7, f.y - FR - 30); ctx.lineTo(f.x + 7, f.y - FR - 30); ctx.lineTo(f.x, f.y - FR - 20); ctx.fill();
    }
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
      bar(x, y + 20, 280, 7, f.energy, 100, f.energy >= BEAM_COST ? '#facc15' : '#a16207', right);
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
