// Menú (HTML), render, input y bucle principal (navegador).
(function () {
  const { W, H, FR, CHARS, BEAM_COST, makeRoster, createGame, step, aiInput } = window.Game;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#c'), ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false, right: false };
  let scene = 'menu', game = null, aiMem = [], fx = [], shake = 0, last = 0, acc = 0, pendingMode = null;

  // ---------- menú ----------
  function showTab(name) {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $('#tab-play').hidden = name !== 'play';
    $('#tab-news').hidden = name !== 'news';
  }
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

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

  function openPicker(mode) {
    pendingMode = mode;
    $('#pickTitle').textContent = mode === '2v2' ? '2v2 · Elegí tu luchador (tu aliado y los rivales los asigna el juego)'
      : '1v1 · Elegí tu luchador';
    const box = $('#chars'); box.textContent = '';
    CHARS.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'char'; b.style.setProperty('--c', c.color);
      const dot = document.createElement('div'); dot.className = 'dot';
      const n = document.createElement('b'); n.textContent = (i + 1) + '. ' + c.name;
      const s1 = document.createElement('span'); s1.textContent = 'Vida ' + c.hp + ' · Vel ' + c.speed + ' · Daño ' + c.dmg;
      const s2 = document.createElement('span'); s2.textContent = c.forms.join(' → ');
      b.append(dot, n, s1, s2);
      b.addEventListener('click', () => start(pendingMode, i));
      box.appendChild(b);
    });
    $('#modes').hidden = true; $('#pick').hidden = false;
  }
  function closePicker() { pendingMode = null; $('#modes').hidden = false; $('#pick').hidden = true; }
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => openPicker(b.dataset.mode)));
  $('#back').addEventListener('click', closePicker);

  function toMenu() {
    scene = 'menu'; game = null;
    $('#ui').hidden = false; canvas.hidden = true;
    closePicker();
  }

  function start(mode, charIndex) {
    game = createGame(makeRoster(mode, charIndex));
    aiMem = game.fighters.map(() => ({}));
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
    if (scene === 'menu' && pendingMode && e.code >= 'Digit1' && e.code <= 'Digit4') start(pendingMode, +e.code.slice(5) - 1);
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

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 60 + Math.random() * 220;
      fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color });
    }
  }
  function handleEvents() {
    for (const e of game.events) {
      if (e.type === 'hit') { shake = Math.min(14, shake + 3 + e.amt * 0.3); burst(e.x, e.y, '#fff', 8); }
      if (e.type === 'evolve') { shake = 16; burst(e.x, e.y, game.fighters[e.id].base.color, 40); }
      if (e.type === 'clash') { shake = 10; burst(e.x, e.y, '#fff', 30); }
      if (e.type === 'down') { shake = 14; burst(e.x, e.y, '#f87171', 40); }
      if (e.type === 'dash') burst(e.x, e.y, '#9ef', 6);
    }
    game.events.length = 0;
  }

  function update(dt) {
    if (scene !== 'play') return;
    const inputs = game.fighters.map((_, i) => (i === 0 ? playerInput() : aiInput(game, i, aiMem[i])));
    step(game, inputs, dt);
    handleEvents();
    if (game.over) scene = 'over';
  }

  // ---------- dibujo ----------
  const TEAM_COLOR = ['#4ade80', '#f87171'];

  function drawFighter(f) {
    const col = f.base.color;
    ctx.save(); ctx.translate(f.x, f.y);
    // aro del equipo
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
    if (f.id === 0) { // marca del jugador
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
      const tag = f.id === 0 ? ' (vos)' : '';
      ctx.fillText(f.base.name + ' · ' + f.base.forms[f.form] + tag + (dead ? ' ✕' : ''), right ? W - 20 : 20, y + 52);
      ctx.globalAlpha = 1;
    });
  }

  function render() {
    if (scene === 'menu') return;
    ctx.save();
    ctx.fillStyle = '#12141c'; ctx.fillRect(0, 0, W, H);
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
      ctx.fillText(c.a === 0 || c.b === 0 ? '¡CHOQUE! Tocá J / click rápido' : '¡Choque de rayos!', W / 2, H / 2 - 60);
      bar(W / 2 - 200, H / 2 - 40, 400, 16, c.push[c.a], tot, game.fighters[c.a].base.color, false);
    }
    ctx.strokeStyle = '#fff9'; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 8, 0, 7); ctx.stroke();
    hud();
    if (scene === 'over') {
      ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 56px sans-serif';
      ctx.fillText(game.winner === 0 ? '¡VICTORIA!' : 'DERROTA', W / 2, H / 2);
      ctx.font = '20px sans-serif'; ctx.fillText('Enter o click para volver al menú', W / 2, H / 2 + 44);
    }
    ctx.restore();
  }

  function frame(t) {
    const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t; acc += dt;
    while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60; }
    shake *= 0.9;
    for (const p of fx) { p.x += p.vx / 60; p.y += p.vy / 60; p.life -= 1 / 60; }
    fx = fx.filter((p) => p.life > 0);
    render();
    requestAnimationFrame(frame);
  }

  renderNews();
  requestAnimationFrame(frame);
})();
