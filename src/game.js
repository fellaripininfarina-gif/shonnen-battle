// Lógica pura del juego (sin DOM). Funciona en el navegador y en Node (para tests).
// Soporta N luchadores repartidos en 2 equipos (1v1, 2v2).
(function (root) {
  const W = 960, H = 540, FR = 18; // arena y radio de luchador

  // Los personajes viven en src/characters.js (catálogo).
  const Characters = (typeof module !== 'undefined' && module.exports) ? require('./characters.js') : root.Characters;
  const CHARS = Characters.list;
  const FORM_MULT = [
    { hp: 1, speed: 1, dmg: 1 },
    { hp: 1.2, speed: 1.12, dmg: 1.25 },
    { hp: 1.45, speed: 1.25, dmg: 1.6 },
  ];
  const DASH_CD = 0.9; // enfriamiento de la esquiva (Espacio)
  const BEAM_COST = Characters.BEAM_DEFAULT.cost; // costo por defecto; cada personaje puede definir el suyo

  function applyForm(f) {
    const m = FORM_MULT[f.form];
    const ratio = f.maxHp ? f.hp / f.maxHp : 1;
    f.maxHp = f.base.hp * m.hp;
    f.hp = f.maxHp * ratio;
    f.speed = f.base.speed * m.speed;
    f.dmg = f.base.dmg * m.dmg;
  }

  function createFighter(id, base, team, x, y) {
    const f = { id, base, team, x, y, vx: 0, vy: 0, form: 0, power: 0, energy: 30,
      shotCd: 0, dashCd: 0, dashT: 0, dashDx: 0, dashDy: 0, face: team === 0 ? 0 : Math.PI,
      prevFire: false, hurtT: 0, ult: 0, qCd: 0, act: '', actT: 0 };
    applyForm(f);
    f.hp = f.maxHp;
    return f;
  }

  // roster: [{ char, team }]. Se reparten verticalmente dentro de su equipo.
  function createGame(roster, opts) {
    opts = opts || {};
    const perTeam = [0, 0], seen = [0, 0];
    roster.forEach((r) => perTeam[r.team]++);
    const fighters = roster.map((r, id) => {
      const n = perTeam[r.team], k = seen[r.team]++;
      const y = n === 1 ? H / 2 : H / 2 + (k - (n - 1) / 2) * 180;
      return createFighter(id, r.char, r.team, r.team === 0 ? 120 : W - 120, y);
    });
    return { rng: opts.rng || Math.random, time: 0, over: false, winner: -1, clash: null,
      fighters, shots: [], events: [] };
  }

  // Arma los participantes de un modo contra la computadora.
  // El jugador humano siempre es el luchador 0 (equipo 0).
  function makeRoster(mode, charIndex, rng) {
    rng = rng || Math.random;
    const others = CHARS.filter((_, i) => i !== charIndex);
    for (let i = others.length - 1; i > 0; i--) { // mezcla
      const j = Math.floor(rng() * (i + 1));
      [others[i], others[j]] = [others[j], others[i]];
    }
    const me = { char: CHARS[charIndex], team: 0 };
    if (mode === '2v2') {
      return [me, { char: others[0], team: 0 }, { char: others[1], team: 1 }, { char: others[2], team: 1 }];
    }
    return [me, { char: others[0], team: 1 }];
  }

  function alive(f) { return f.hp > 0; }

  function addPower(s, f, amt) {
    f.power = Math.min(100, f.power + amt);
    if (f.power >= 100 && f.form < FORM_MULT.length - 1) {
      f.form++; f.power = 0;
      applyForm(f);
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.25);
      s.events.push({ type: 'evolve', x: f.x, y: f.y, id: f.id, team: f.team, form: f.form });
    }
  }

  function damage(s, target, owner, amt) {
    if (s.over || !alive(target)) return;
    target.hp = Math.max(0, target.hp - amt);
    target.hurtT = 0.15;
    addPower(s, target, amt * 0.6);
    addPower(s, owner, amt * 1.2);
    owner.ult = Math.min(100, owner.ult + amt * 0.9);   // la barra de ulti se carga golpeando y recibiendo golpes
    target.ult = Math.min(100, target.ult + amt * 0.5);
    owner.energy = Math.min(100, owner.energy + amt * 0.8);
    s.events.push({ type: 'hit', x: target.x, y: target.y, amt });
    if (!alive(target)) {
      s.events.push({ type: 'down', x: target.x, y: target.y, id: target.id });
      if (!s.fighters.some((f) => f.team === target.team && alive(f))) {
        s.over = true; s.winner = owner.team;
      }
    }
  }

  function updateFighter(s, f, inp, dt) {
    f.shotCd -= dt; f.dashCd -= dt; f.hurtT -= dt; f.qCd -= dt; f.actT -= dt;
    if (f.actT <= 0) f.act = '';
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
      f.dashT = 0.18; f.dashCd = DASH_CD;
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

    const ki = f.base.ki, beam = f.base.beam;
    if (inp.fire && f.shotCd <= 0) {
      f.shotCd = f.base.shotCd; f.act = 'shoot'; f.actT = 0.18;
      s.shots.push({ type: 'ki', owner: f.id, team: f.team, x: f.x, y: f.y,
        vx: Math.cos(f.face) * ki.speed, vy: Math.sin(f.face) * ki.speed, r: ki.r, dmg: f.dmg * ki.dmgMul, life: ki.life });
    }
    if (inp.special && f.energy >= beam.cost) {
      f.energy -= beam.cost; f.act = 'beam'; f.actT = 0.5;
      s.shots.push({ type: 'beam', owner: f.id, team: f.team, x: f.x, y: f.y,
        vx: Math.cos(f.face) * beam.speed, vy: Math.sin(f.face) * beam.speed, r: beam.r, dmg: f.dmg * beam.dmgMul, life: beam.life });
      s.events.push({ type: 'beam', x: f.x, y: f.y });
    }
    const q = f.base.q, ult = f.base.ult;
    if (inp.q && f.qCd <= 0 && f.energy >= q.cost) { // onda de área: daña y empuja a los rivales cercanos
      f.energy -= q.cost; f.qCd = q.cd; f.act = 'pulse'; f.actT = 0.45;
      s.events.push({ type: 'pulse', x: f.x, y: f.y, id: f.id });
      for (const p of s.shots) {
        if (p.type === 'ki' && p.team !== f.team && Math.hypot(p.x - f.x, p.y - f.y) < q.radius) p.life = 0;
      }
      for (const t of s.fighters) {
        if (t.team === f.team || !alive(t) || t.dashT > 0) continue;
        const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy);
        if (d > q.radius) continue;
        damage(s, t, f, f.dmg * q.dmgMul);
        const k = d || 1;
        t.x = Math.min(W - FR, Math.max(FR, t.x + (dx / k) * q.push));
        t.y = Math.min(H - FR, Math.max(FR, t.y + (dy / k) * q.push));
      }
    }
    if (inp.ult && f.ult >= 100) { // definitiva: rayo grande que atraviesa a todos los rivales
      f.ult = 0; f.act = 'ult'; f.actT = 0.8;
      s.shots.push({ type: 'ult', owner: f.id, team: f.team, x: f.x, y: f.y,
        vx: Math.cos(f.face) * ult.speed, vy: Math.sin(f.face) * ult.speed, r: ult.r, dmg: f.dmg * ult.dmgMul,
        life: ult.life, pierce: true, hit: {} });
      s.events.push({ type: 'ult', x: f.x, y: f.y, id: f.id });
    }
  }

  function updateShots(s, dt) {
    for (const p of s.shots) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.life = 0;
      if (p.life <= 0) continue;
      for (const t of s.fighters) {
        if (t.team === p.team || !alive(t) || t.dashT > 0) continue; // aliados no se dañan; esquivar = invulnerable
        if (p.pierce && p.hit[t.id]) continue;
        if (Math.hypot(p.x - t.x, p.y - t.y) < p.r + FR) {
          damage(s, t, s.fighters[p.owner], p.dmg);
          if (!p.pierce) { p.life = 0; break; }
          p.hit[t.id] = true; // atraviesa: cada rival recibe el golpe una sola vez
        }
      }
    }
    // un rayo absorbe disparos enemigos
    const beams = s.shots.filter((p) => p.type === 'beam' && p.life > 0);
    for (const b of beams) {
      for (const p of s.shots) {
        if (p.type === 'ki' && p.life > 0 && p.team !== b.team &&
            Math.hypot(p.x - b.x, p.y - b.y) < p.r + b.r) p.life = 0;
      }
    }
    // choque de rayos entre equipos distintos
    outer:
    for (const b1 of beams) {
      for (const b2 of beams) {
        if (b1.team < b2.team && Math.hypot(b1.x - b2.x, b1.y - b2.y) < b1.r + b2.r) {
          b1.life = 0; b2.life = 0;
          s.clash = { t: 2.2, a: b1.owner, b: b2.owner, push: { [b1.owner]: 0, [b2.owner]: 0 },
            x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
          s.events.push({ type: 'clash', x: s.clash.x, y: s.clash.y });
          break outer;
        }
      }
    }
    s.shots = s.shots.filter((p) => p.life > 0);
  }

  function stepClash(s, inputs, dt) {
    const c = s.clash;
    c.t -= dt;
    s.fighters.forEach((f, i) => {
      const inp = inputs[i];
      if ((i === c.a || i === c.b) && inp.fire && !f.prevFire) c.push[i]++;
      f.prevFire = !!inp.fire;
      f.face = Math.atan2(inp.ay - f.y, inp.ax - f.x);
    });
    if (c.t <= 0) {
      const A = s.fighters[c.a], B = s.fighters[c.b];
      const pa = c.push[c.a], pb = c.push[c.b];
      s.clash = null;
      if (pa === pb) { damage(s, A, B, 12); damage(s, B, A, 12); }
      else if (pa > pb) damage(s, B, A, 30);
      else damage(s, A, B, 30);
    }
  }

  // inputs[i] = { mx, my, ax, ay, fire, dash, special, q, ult } para el luchador i.
  function step(s, inputs, dt) {
    if (s.over) return;
    s.time += dt;
    if (s.clash) { stepClash(s, inputs, dt); return; }
    s.fighters.forEach((f, i) => {
      if (alive(f)) updateFighter(s, f, inputs[i], dt);
      f.prevFire = !!inputs[i].fire;
    });
    updateShots(s, dt);
  }

  const IDLE = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, dash: false, special: false, q: false, ult: false };

  // IA sencilla: ataca al enemigo vivo más cercano, mantiene distancia, esquiva y usa el rayo.
  function aiInput(s, i, mem) {
    const me = s.fighters[i], r = s.rng;
    if (!alive(me)) return IDLE;
    const foes = s.fighters.filter((f) => f.team !== me.team && alive(f));
    if (!foes.length) return IDLE;
    let foe = foes[0];
    for (const f of foes) {
      if (Math.hypot(f.x - me.x, f.y - me.y) < Math.hypot(foe.x - me.x, foe.y - me.y)) foe = f;
    }
    mem.t = (mem.t || 0) - 1 / 60;
    if (mem.t <= 0) { mem.t = 0.4 + r() * 0.6; mem.strafe = r() < 0.5 ? -1 : 1; }
    const dx = foe.x - me.x, dy = foe.y - me.y, d = Math.hypot(dx, dy) || 1;
    const want = 260;
    const fwd = d > want + 40 ? 1 : d < want - 60 ? -1 : 0;
    const mx = (dx / d) * fwd + (-dy / d) * mem.strafe * 0.8;
    const my = (dy / d) * fwd + (dx / d) * mem.strafe * 0.8;
    const danger = s.shots.some((p) => p.team !== me.team && Math.hypot(p.x - me.x, p.y - me.y) < 110);
    const lead = d / me.base.ki.speed * 0.5;
    const c = s.clash;
    const fire = c ? ((c.a === i || c.b === i) && r() < 0.5) : r() < 0.92;
    return {
      mx, my, ax: foe.x + foe.vx * lead, ay: foe.y + foe.vy * lead,
      fire,
      dash: danger && r() < 0.25,
      special: me.energy >= me.base.beam.cost && r() < 0.05,
      q: me.qCd <= 0 && me.energy >= me.base.q.cost && d < me.base.q.radius * 0.85 && r() < 0.15,
      ult: me.ult >= 100 && r() < 0.06,
    };
  }

  const api = { W, H, FR, CHARS, FORM_MULT, BEAM_COST, DASH_CD, createGame, makeRoster, step, aiInput };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof window !== 'undefined' ? window : globalThis);
