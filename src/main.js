// Render, input y bucle principal (navegador).
(function () {
  const { W, H, FR, CHARS, BEAM_COST, createGame, step, aiInput } = window.Game;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;

  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false, right: false };
  let scene = 'menu', game = null, aiMem = {}, fx = [], shake = 0, last = 0, acc = 0, picked = 0;

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * W;
    mouse.y = ((e.clientY - r.top) / r.height) * H;
  }
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (scene === 'menu' && e.code >= 'Digit1' && e.code <= 'Digit4') start(+e.code.slice(5) - 1);
    if (scene === 'over' && e.code === 'Enter') scene = 'menu';
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  canvas.addEventListener('mousemove', toCanvas);
  canvas.addEventListener('mousedown', (e) => {
    toCanvas(e);
    if (scene === 'menu') {
      const i = cardAt(mouse.x, mouse.y);
      if (i >= 0) start(i);
      return;
    }
    if (scene === 'over') { scene = 'menu'; return; }
    if (e.button === 2) mouse.right = true; else mouse.down = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 2) mouse.right = false; else mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function cardAt(x, y) {
    for (let i = 0; i < CHARS.length; i++) {
      const cx = 90 + i * 220;
      if (x > cx && x < cx + 200 && y > 170 && y < 400) return i;
    }
    return -1;
  }

  function start(i) {
    picked = i;
    let j = Math.floor(Math.random() * CHARS.length);
    if (j === i) j = (j + 1) % CHARS.length;
    game = createGame(CHARS[i], CHARS[j]);
    aiMem = {}; fx = []; shake = 0; scene = 'play';
  }

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

  function handleEvents() {
    for (const e of game.events) {
      if (e.type === 'hit') { shake = Math.min(14, shake + 3 + e.amt * 0.3); burst(e.x, e.y, '#fff', 8); }
      if (e.type === 'evolve') { shake = 16; burst(e.x, e.y, game.fighters[e.team].base.color, 40); }
      if (e.type === 'clash') { shake = 10; burst(e.x, e.y, '#fff', 30); }
      if (e.type === 'dash') burst(e.x, e.y, '#9ef', 6);
    }
    game.events.length = 0;
  }
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 60 + Math.random() * 220;
      fx.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, color });
    }
  }

  function update(dt) {
    if (scene !== 'play') return;
    step(game, [playerInput(), aiInput(game, 1, aiMem)], dt);
    handleEvents();
    if (game.over) scene = 'over';
  }

  // ---------- dibujo ----------
  function drawFighter(f) {
    const col = f.base.color;
    ctx.save(); ctx.translate(f.x, f.y);
    const auraR = FR + 6 + f.form * 6 + Math.sin(game.time * 12) * 2;
    if (f.form > 0 || f.dashT > 0) {
      ctx.fillStyle = col + '55'; ctx.beginPath(); ctx.arc(0, 0, auraR + 6, 0, 7); ctx.fill();
    }
    ctx.fillStyle = f.hurtT > 0 ? '#fff' : col;
    ctx.beginPath(); ctx.arc(0, 0, FR, 0, 7); ctx.fill();
    // pelo en pinchos: más pinchos al evolucionar
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
  }

  function bar(x, y, w, h, v, max, color, right) {
    ctx.fillStyle = '#0008'; ctx.fillRect(x, y, w, h);
    const ww = (w * Math.max(0, v)) / max;
    ctx.fillStyle = color; ctx.fillRect(right ? x + w - ww : x, y, ww, h);
    ctx.strokeStyle = '#fff6'; ctx.strokeRect(x, y, w, h);
  }

  function hud() {
    game.fighters.forEach((f, i) => {
      const right = i === 1, x = right ? W - 340 : 20;
      bar(x, 18, 320, 18, f.hp, f.maxHp, '#4ade80', right);
      bar(x, 40, 320, 8, f.energy, 100, f.energy >= BEAM_COST ? '#facc15' : '#a16207', right);
      bar(x, 52, 320, 6, f.form === 2 ? 100 : f.power, 100, '#f472b6', right);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillText(f.base.name + ' · ' + f.base.forms[f.form], right ? W - 20 : 20, 78);
    });
  }

  function render() {
    ctx.save();
    ctx.fillStyle = '#12141c'; ctx.fillRect(0, 0, W, H);
    if (scene === 'menu') return drawMenu();
    if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    ctx.strokeStyle = '#ffffff10';
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    game.fighters.forEach(drawFighter);
    for (const p of game.shots) {
      ctx.fillStyle = game.fighters[p.owner].base.color;
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = p.type === 'beam' ? 30 : 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
    for (const p of fx) { ctx.globalAlpha = Math.max(0, p.life * 2); ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 3, 3); }
    ctx.globalAlpha = 1;
    if (game.clash) {
      const c = game.clash, tot = c.push[0] + c.push[1] || 1;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('¡CHOQUE! Tocá J / click rápido', W / 2, H / 2 - 60);
      bar(W / 2 - 200, H / 2 - 40, 400, 16, c.push[0], tot, game.fighters[0].base.color, false);
    }
    // cursor de mira
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

  function drawMenu() {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 54px sans-serif';
    ctx.fillText('SHONEN BATTLE', W / 2, 90);
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#9aa';
    ctx.fillText('Elegí tu luchador (click o teclas 1-4)', W / 2, 130);
    CHARS.forEach((c, i) => {
      const x = 90 + i * 220, hover = cardAt(mouse.x, mouse.y) === i;
      ctx.fillStyle = hover ? '#2a2f42' : '#1c2030'; ctx.fillRect(x, 170, 200, 230);
      ctx.strokeStyle = c.color; ctx.lineWidth = 2; ctx.strokeRect(x, 170, 200, 230); ctx.lineWidth = 1;
      ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(x + 100, 250, 30, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.fillText((i + 1) + '. ' + c.name, x + 100, 320);
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#9aa';
      ctx.fillText('Vida ' + c.hp + ' · Vel ' + c.speed + ' · Daño ' + c.dmg, x + 100, 345);
      ctx.fillText(c.forms.join(' → '), x + 100, 368);
    });
    ctx.fillStyle = '#9aa'; ctx.font = '14px sans-serif';
    ctx.fillText('WASD mover · mouse apuntar · click/J disparar · Espacio esquivar · click derecho/E rayo', W / 2, 460);
    ctx.fillText('Cargá la barra rosa para evolucionar en plena batalla', W / 2, 484);
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
  requestAnimationFrame(frame);
})();
