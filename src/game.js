// Lógica pura del juego (sin DOM). Funciona en el navegador y en Node (para tests).
(function (root) {
  const W = 960, H = 540, FR = 18; // arena y radio de luchador

  const CHARS = [
    { id: 'kaito', name: 'Kaito', color: '#ff7a3d', hp: 100, speed: 210, dmg: 8, shotCd: 0.28,
      forms: ['Base', 'Despertar', 'Ascensión'] },
    { id: 'ryuu', name: 'Ryuu', color: '#e63946', hp: 140, speed: 170, dmg: 10, shotCd: 0.38,
      forms: ['Base', 'Furia', 'Dragón Rojo'] },
    { id: 'sora', name: 'Sora', color: '#4cc9f0', hp: 85, speed: 270, dmg: 6.5, shotCd: 0.2,
      forms: ['Base', 'Relámpago', 'Cielo Roto'] },
    { id: 'mira', name: 'Mira', color: '#b980f0', hp: 95, speed: 215, dmg: 9, shotCd: 0.3,
      forms: ['Base', 'Eclipse', 'Luna Negra'] },
  ];
  const FORM_MULT = [
    { hp: 1, speed: 1, dmg: 1 },
    { hp: 1.2, speed: 1.12, dmg: 1.25 },
    { hp: 1.45, speed: 1.25, dmg: 1.6 },
  ];
  const BEAM_COST = 60;

  function applyForm(f) {
    const m = FORM_MULT[f.form];
    const ratio = f.maxHp ? f.hp / f.maxHp : 1;
    f.maxHp = f.base.hp * m.hp;
    f.hp = f.maxHp * ratio;
    f.speed = f.base.speed * m.speed;
    f.dmg = f.base.dmg * m.dmg;
  }

  function createFighter(base, x, y, team) {
    const f = { base, team, x, y, vx: 0, vy: 0, form: 0, power: 0, energy: 30,
      shotCd: 0, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0, face: team === 0 ? 0 : Math.PI,
      prevFire: false, hurtT: 0 };
    applyForm(f);
    f.hp = f.maxHp;
    return f;
  }

  function createGame(charA, charB, opts) {
    opts = opts || {};
    return {
      rng: opts.rng || Math.random,
      time: 0, over: false, winner: -1, clash: null,
      fighters: [createFighter(charA, 120, H / 2, 0), createFighter(charB, W - 120, H / 2, 1)],
      shots: [], events: [],
    };
  }

  function addPower(s, f, amt) {
    f.power = Math.min(100, f.power + amt);
    if (f.power >= 100 && f.form < FORM_MULT.length - 1) {
      f.form++; f.power = 0;
      applyForm(f);
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.25);
      s.events.push({ type: 'evolve', x: f.x, y: f.y, team: f.team, form: f.form });
    }
  }

  function damage(s, target, owner, amt) {
    target.hp = Math.max(0, target.hp - amt);
    target.hurtT = 0.15;
    addPower(s, target, amt * 0.6);
    addPower(s, owner, amt * 1.2);
    owner.energy = Math.min(100, owner.energy + amt * 0.8);
    s.events.push({ type: 'hit', x: target.x, y: target.y, amt });
    if (target.hp <= 0 && !s.over) { s.over = true; s.winner = owner.team; }
  }

  function updateFighter(s, f, inp, dt) {
    f.shotCd -= dt; f.dashCd -= dt; f.hurtT -= dt;
    f.energy = Math.min(100, f.energy + 8 * dt);
    f.face = Math.atan2(inp.ay - f.y, inp.ax - f.x);

    let mx = inp.mx, my = inp.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    if (inp.dash && f.dashCd <= 0 && f.dashT <= 0) {
      let dx = mx, dy = my;
      if (len < 0.1) { dx = Math.cos(f.face); dy = Math.sin(f.face); }
      const dl = Math.hypot(dx, dy) || 1;
      f.dashDx = dx / dl; f.dashDy = dy / dl;
      f.dashT = 0.18; f.dashCd = 0.9;
      s.events.push({ type: 'dash', x: f.x, y: f.y });
    }
    if (f.dashT > 0) {
      f.dashT -= dt;
      f.vx = f.dashDx * 640; f.vy = f.dashDy * 640;
    } else {
      f.vx = mx * f.speed; f.vy = my * f.speed;
    }
    f.x = Math.min(W - FR, Math.max(FR, f.x + f.vx * dt));
    f.y = Math.min(H - FR, Math.max(FR, f.y + f.vy * dt));

    if (inp.fire && f.shotCd <= 0) {
      f.shotCd = f.base.shotCd;
      s.shots.push({ type: 'ki', owner: f.team, x: f.x, y: f.y,
        vx: Math.cos(f.face) * 520, vy: Math.sin(f.face) * 520, r: 7, dmg: f.dmg, life: 2 });
    }
    if (inp.special && f.energy >= BEAM_COST) {
      f.energy -= BEAM_COST;
      s.shots.push({ type: 'beam', owner: f.team, x: f.x, y: f.y,
        vx: Math.cos(f.face) * 420, vy: Math.sin(f.face) * 420, r: 18, dmg: f.dmg * 4, life: 3 });
      s.events.push({ type: 'beam', x: f.x, y: f.y });
    }
  }

  function updateShots(s, dt) {
    for (const p of s.shots) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.life = 0;
      if (p.life <= 0) continue;
      const target = s.fighters[1 - p.owner];
      if (target.dashT > 0) continue; // invulnerable al esquivar
      if (Math.hypot(p.x - target.x, p.y - target.y) < p.r + FR) {
        damage(s, target, s.fighters[p.owner], p.dmg);
        p.life = 0;
      }
    }
    // un rayo absorbe disparos enemigos
    const beams = s.shots.filter((p) => p.type === 'beam' && p.life > 0);
    for (const b of beams) {
      for (const p of s.shots) {
        if (p.type === 'ki' && p.life > 0 && p.owner !== b.owner &&
            Math.hypot(p.x - b.x, p.y - b.y) < p.r + b.r) p.life = 0;
      }
    }
    // choque de rayos
    const [b1, b2] = [beams.find((b) => b.owner === 0), beams.find((b) => b.owner === 1)];
    if (b1 && b2 && Math.hypot(b1.x - b2.x, b1.y - b2.y) < b1.r + b2.r) {
      b1.life = 0; b2.life = 0;
      s.clash = { t: 2.2, push: [0, 0], x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
      s.events.push({ type: 'clash', x: s.clash.x, y: s.clash.y });
    }
    s.shots = s.shots.filter((p) => p.life > 0);
  }

  function stepClash(s, inputs, dt) {
    const c = s.clash;
    c.t -= dt;
    s.fighters.forEach((f, i) => {
      if (inputs[i].fire && !f.prevFire) c.push[i]++;
      f.prevFire = inputs[i].fire;
      f.face = Math.atan2(inputs[i].ay - f.y, inputs[i].ax - f.x);
    });
    if (c.t <= 0) {
      const [a, b] = c.push;
      const F = s.fighters;
      if (a === b) { damage(s, F[0], F[1], 12); damage(s, F[1], F[0], 12); }
      else {
        const w = a > b ? 0 : 1;
        damage(s, F[1 - w], F[w], 30);
      }
      s.clash = null;
    }
  }

  function step(s, inputs, dt) {
    if (s.over) return;
    s.time += dt;
    if (s.clash) { stepClash(s, inputs, dt); return; }
    s.fighters.forEach((f, i) => { updateFighter(s, f, inputs[i], dt); f.prevFire = inputs[i].fire; });
    updateShots(s, dt);
  }

  // IA sencilla: mantiene distancia, esquiva, dispara y usa el rayo.
  function aiInput(s, i, mem) {
    const me = s.fighters[i], foe = s.fighters[1 - i], r = s.rng;
    mem.t = (mem.t || 0) - 1 / 60;
    if (mem.t <= 0) { mem.t = 0.4 + r() * 0.6; mem.strafe = r() < 0.5 ? -1 : 1; }
    const dx = foe.x - me.x, dy = foe.y - me.y, d = Math.hypot(dx, dy) || 1;
    const want = 260;
    const fwd = d > want + 40 ? 1 : d < want - 60 ? -1 : 0;
    let mx = (dx / d) * fwd + (-dy / d) * mem.strafe * 0.8;
    let my = (dy / d) * fwd + (dx / d) * mem.strafe * 0.8;
    const danger = s.shots.some((p) => p.owner !== i && Math.hypot(p.x - me.x, p.y - me.y) < 110);
    // apunta con un poco de adelanto
    const lead = d / 520 * 0.5;
    return {
      mx, my, ax: foe.x + foe.vx * lead, ay: foe.y + foe.vy * lead,
      fire: r() < 0.92 && !s.clash ? true : (s.clash ? r() < 0.5 : false),
      dash: danger && r() < 0.25,
      special: me.energy >= BEAM_COST && r() < 0.05,
    };
  }

  const api = { W, H, FR, CHARS, FORM_MULT, BEAM_COST, createGame, step, aiInput };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
