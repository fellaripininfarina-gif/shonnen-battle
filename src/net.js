// Capa de red para partidas online sobre Firebase Realtime Database (sin servidor propio).
//
// Modelo: el "anfitrión" (el primer jugador de la sala) corre la simulación completa con game.js.
// Los demás jugadores le mandan sus controles (20 veces por segundo) y reciben instantáneas del
// estado (15 por segundo), que dibujan con interpolación. Si alguien deja de enviar controles
// durante unos segundos, la IA toma su lugar.
//
// Rutas usadas:
//   queue/{modo}/{uid}      jugadores esperando partida
//   matches/{uid}           id de la sala asignada a ese jugador
//   rooms/{id}              { mode, host, t, players:[{uid,name,char,team}] }
//   rooms/{id}/inputs/{uid} controles de cada jugador
//   rooms/{id}/state        última instantánea publicada por el anfitrión
(function (root) {
  const NEED = { '1v1': 2, '2v2': 4 };
  const TICKS_PER_SNAP = 4;   // 60 Hz / 4 = 15 instantáneas por segundo
  const INPUT_MS = 50;        // controles de los clientes a 20 Hz
  const STALE_MS = 5000;      // sin controles durante 5 s: toma el control la IA
  const HOST_LOST_MS = 5000;  // sin instantáneas durante 5 s: se perdió el anfitrión
  const COUNTDOWN_MS = 3000;
  const R = Math.round;
  const ACTS = ['', 'shoot', 'beam', 'ult', 'pulse']; // qué está haciendo un luchador (para su animación)
  const SHOT_TYPES = ['ki', 'beam', 'ult'];

  function sortQueue(obj) {
    return Object.entries(obj || {})
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => a.t - b.t || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  }

  // ---------- emparejamiento ----------
  // me = { uid, name, char }. handlers = { onProgress(n, need), onMatch(roomId), onError(err), now }
  function joinQueue(db, me, mode, handlers) {
    handlers = handlers || {};
    const need = NEED[mode];
    const now = handlers.now || Date.now;
    const qRef = db.ref('queue/' + mode);
    const mine = db.ref('queue/' + mode + '/' + me.uid);
    const match = db.ref('matches/' + me.uid);
    let done = false, creating = false;

    const fail = (e) => { if (handlers.onError) handlers.onError(e); };
    const stop = () => { qRef.off('value', onQueue); match.off('value', onMatch); };

    function onQueue(snap) {
      if (done) return;
      const list = sortQueue(snap.val());
      if (handlers.onProgress) handlers.onProgress(Math.min(list.length, need), need);
      // El jugador que lleva más tiempo esperando arma la sala cuando hay suficientes.
      if (!creating && list.length >= need && list[0].uid === me.uid) {
        creating = true;
        const chosen = list.slice(0, need);
        const roomId = me.uid.slice(0, 6) + now().toString(36);
        const players = chosen.map((p, i) => ({ uid: p.uid, name: p.name, char: p.char, team: i % 2 }));
        const upd = {};
        upd['rooms/' + roomId] = { mode, host: me.uid, t: now(), players };
        chosen.forEach((p) => {
          upd['matches/' + p.uid] = roomId;
          upd['queue/' + mode + '/' + p.uid] = null;
        });
        db.ref().update(upd).catch((e) => { creating = false; fail(e); });
      }
    }
    function onMatch(snap) {
      const id = snap.val();
      if (!id || done) return;
      done = true; stop();
      match.remove();
      if (handlers.onMatch) handlers.onMatch(id);
    }

    match.remove()
      .then(() => {
        if (done) return null;
        mine.onDisconnect().remove();
        return mine.set({ name: me.name, char: me.char, t: now() });
      })
      .then(() => { if (!done) { qRef.on('value', onQueue); match.on('value', onMatch); } })
      .catch(fail);

    return {
      cancel() {
        if (done) return;
        done = true; stop();
        mine.remove();
        mine.onDisconnect().cancel();
      },
    };
  }

  // Avisa cuando se arma una partida para este jugador (salas privadas). Devuelve cómo dejar de escuchar.
  function watchMatch(db, uid, cb) {
    const ref = db.ref('matches/' + uid);
    const fn = (snap) => {
      const id = snap.val();
      if (!id) return;
      ref.remove();
      cb(id);
    };
    ref.on('value', fn);
    return () => ref.off('value', fn);
  }

  function loadRoom(db, roomId) {
    return db.ref('rooms/' + roomId).once('value').then((s) => s.val());
  }

  // ---------- instantáneas ----------
  function encode(game, n, evs, cd) {
    const c = game.clash;
    const s = {
      n, tm: R(game.time * 1000), ov: game.over ? 1 : 0, w: game.winner, cd: cd || 0,
      f: game.fighters.map((f) => [R(f.x), R(f.y), R(f.hp * 10), R(f.maxHp * 10), R(f.energy), R(f.power),
        f.form, R(f.face * 100), f.dashT > 0 ? 1 : 0, f.hurtT > 0 ? 1 : 0, R(f.ult), f.actT > 0 ? Math.max(0, ACTS.indexOf(f.act)) : 0,
        R(Math.max(0, f.shotCd) * 100), R(Math.max(0, f.dashCd) * 100), R(Math.max(0, f.qCd) * 100)]),
    };
    if (game.shots.length) s.s = game.shots.map((p) => [Math.max(0, SHOT_TYPES.indexOf(p.type)), p.owner, p.team, R(p.x), R(p.y), R(Math.atan2(p.vy, p.vx) * 100)]);
    if (c) s.cl = [c.a, c.b, c.push[c.a], c.push[c.b], R(c.t * 100)];
    if (evs && evs.length) s.ev = evs;
    return s;
  }

  // meta = [{ base, team, name }] en el mismo orden que los luchadores.
  function decode(s, meta) {
    return {
      n: s.n,
      fighters: s.f.map((a, i) => ({
        id: i, base: meta[i].base, team: meta[i].team, name: meta[i].name,
        x: a[0], y: a[1], hp: a[2] / 10, maxHp: a[3] / 10, energy: a[4], power: a[5], form: a[6],
        face: a[7] / 100, dashT: a[8] ? 0.1 : 0, hurtT: a[9] ? 0.1 : 0, vx: 0, vy: 0,
        ult: a[10] || 0, act: ACTS[a[11] || 0] || '', actT: a[11] ? 0.1 : 0,
        shotCd: (a[12] || 0) / 100, dashCd: (a[13] || 0) / 100, qCd: (a[14] || 0) / 100,
      })),
      shots: (s.s || []).map((a) => {
        const b = meta[a[1]].base;
        const type = SHOT_TYPES[a[0]] || 'ki';
        return { type, owner: a[1], team: a[2], x: a[3], y: a[4], a: (a[5] || 0) / 100, r: b[type].r };
      }),
      clash: s.cl ? { a: s.cl[0], b: s.cl[1], push: { [s.cl[0]]: s.cl[2], [s.cl[1]]: s.cl[3] }, t: s.cl[4] / 100 } : null,
      time: s.tm / 1000, over: !!s.ov, winner: s.w, cd: s.cd || 0,
      events: (s.ev || []).map((e) => ({ type: e.t, x: e.x, y: e.y, amt: e.a || 0, id: e.i || 0 })),
    };
  }

  function compactEvent(e) {
    return { t: e.type, x: R(e.x || 0), y: R(e.y || 0), a: R((e.amt || 0) * 10) / 10, i: e.id || 0 };
  }

  // ---------- anfitrión ----------
  function createHost(db, roomId, room, myUid, opts) {
    const Game = opts.Game, now = opts.now || Date.now;
    const players = Object.values(room.players);
    const game = Game.createGame(players.map((p) => ({ char: Game.CHARS[p.char], team: p.team })), { rng: opts.rng });
    game.fighters.forEach((f, i) => { f.name = players[i].name; });
    const aiMem = players.map(() => ({}));
    const startAt = now() + COUNTDOWN_MS;
    const remote = {};
    players.forEach((p) => {
      if (p.uid !== myUid) remote[p.uid] = { inp: null, seq: -1, lastSeen: now(), pending: 0, lastFc: 0, held: false, lastFire: false };
    });
    const inRef = db.ref('rooms/' + roomId + '/inputs');
    const stateRef = db.ref('rooms/' + roomId + '/state');

    const onInputs = (snap) => {
      const v = snap.val() || {};
      for (const uid in remote) {
        const x = v[uid], r = remote[uid];
        if (!x || x.seq === r.seq) continue;
        r.seq = x.seq; r.lastSeen = now(); r.inp = x;
        const fc = x.fc || 0;
        if (fc > r.lastFc) r.pending += Math.min(10, fc - r.lastFc);
        r.lastFc = fc; r.held = !!x.fire;
      }
    };
    inRef.on('value', onInputs);

    // Controles de un jugador remoto. Los toques de "disparar" se cuentan (fc) para que no se
    // pierdan al machacar durante un choque de rayos.
    function remoteInput(uid) {
      const r = remote[uid];
      if (!r.inp || now() - r.lastSeen > STALE_MS) return null;
      let fire = false;
      if (r.pending > 0 && !r.lastFire) { fire = true; r.pending--; }
      else if (!game.clash) fire = r.held;
      r.lastFire = fire;
      const x = r.inp;
      return { mx: x.mx || 0, my: x.my || 0, ax: x.ax || 0, ay: x.ay || 0, fire, dash: !!x.dash, special: !!x.special, q: !!x.q, ult: !!x.ult };
    }

    let ticks = 0, n = 0, evBuf = [], stopped = false;
    const countdown = () => Math.max(0, Math.ceil((startAt - now()) / 1000));
    function publish() {
      stateRef.set(encode(game, ++n, evBuf, countdown())).catch(() => {});
      evBuf = [];
    }
    function tick(local, dt) {
      if (stopped) return;
      ticks++;
      if (now() < startAt) { if (ticks % TICKS_PER_SNAP === 0) publish(); return; }
      const inputs = players.map((p, i) => (p.uid === myUid ? local : (remoteInput(p.uid) || Game.aiInput(game, i, aiMem[i]))));
      Game.step(game, inputs, dt);
      for (const e of game.events) if (e.type !== 'dash' && evBuf.length < 12) evBuf.push(compactEvent(e));
      if (ticks % TICKS_PER_SNAP === 0 || game.over) publish();
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      inRef.off('value', onInputs);
      db.ref('rooms/' + roomId).remove().catch(() => {});
    }
    return { game, players, tick, stop, countdown };
  }

  // ---------- cliente ----------
  function createClient(db, roomId, room, myUid, opts) {
    const Game = opts.Game, now = opts.now || Date.now;
    const players = Object.values(room.players);
    const meta = players.map((p) => ({ base: Game.CHARS[p.char], team: p.team, name: p.name }));
    const inRef = db.ref('rooms/' + roomId + '/inputs/' + myUid);
    const stateRef = db.ref('rooms/' + roomId + '/state');
    inRef.onDisconnect().remove();

    let cur = null, prev = null, tCur = 0, tPrev = 0, lastN = -1, pendingEv = [], lastRecv = now();
    const onState = (snap) => {
      const v = snap.val();
      if (!v || v.n === undefined || v.n === lastN) return;
      lastN = v.n; lastRecv = now();
      prev = cur; tPrev = tCur;
      cur = decode(v, meta); tCur = now();
      pendingEv.push(...cur.events);
    };
    stateRef.on('value', onState);

    let seq = 0, fc = 0, prevFire = false, prevDash = false, prevSpecial = false, prevQ = false, prevUlt = false;
    let latchDash = false, latchSpecial = false, latchQ = false, latchUlt = false, lastSend = -1e9;
    // Se llama una vez por cuadro con los controles actuales.
    function sendInput(inp) {
      const t = now();
      const rise = !!inp.fire && !prevFire, dRise = !!inp.dash && !prevDash, sRise = !!inp.special && !prevSpecial;
      if (rise) fc++;
      if (dRise) latchDash = true;
      if (sRise) latchSpecial = true;
      const qRise = !!inp.q && !prevQ, uRise = !!inp.ult && !prevUlt;
      if (qRise) latchQ = true;
      if (uRise) latchUlt = true;
      prevFire = !!inp.fire; prevDash = !!inp.dash; prevSpecial = !!inp.special; prevQ = !!inp.q; prevUlt = !!inp.ult;
      if (rise || dRise || sRise || qRise || uRise || t - lastSend >= INPUT_MS) {
        lastSend = t;
        inRef.set({
          mx: R(inp.mx * 100) / 100, my: R(inp.my * 100) / 100, ax: R(inp.ax), ay: R(inp.ay),
          fire: inp.fire ? 1 : 0, dash: (inp.dash || latchDash) ? 1 : 0, special: (inp.special || latchSpecial) ? 1 : 0, q: (inp.q || latchQ) ? 1 : 0, ult: (inp.ult || latchUlt) ? 1 : 0,
          fc, seq: ++seq,
        }).catch(() => {});
        latchDash = latchSpecial = latchQ = latchUlt = false;
      }
    }
    // Estado para dibujar: posiciones de los luchadores interpoladas entre las dos últimas instantáneas.
    function view() {
      if (!cur) return null;
      let alpha = 1;
      if (prev && tCur > tPrev) alpha = Math.min(1, Math.max(0, (now() - tCur) / (tCur - tPrev)));
      const fighters = cur.fighters.map((f, i) => {
        const p = prev && prev.fighters[i];
        return p ? { ...f, x: p.x + (f.x - p.x) * alpha, y: p.y + (f.y - p.y) * alpha } : f;
      });
      return { fighters, shots: cur.shots, clash: cur.clash, time: cur.time, over: cur.over, winner: cur.winner, cd: cur.cd };
    }
    const takeEvents = () => { const e = pendingEv; pendingEv = []; return e; };
    const hostLost = () => now() - lastRecv > HOST_LOST_MS;
    function stop() {
      stateRef.off('value', onState);
      inRef.remove().catch(() => {});
      inRef.onDisconnect().cancel();
    }
    return { players, sendInput, view, takeEvents, hostLost, stop };
  }

  const api = { NEED, STALE_MS, HOST_LOST_MS, COUNTDOWN_MS, joinQueue, watchMatch, loadRoom, createHost, createClient, encode, decode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Net = api;
})(typeof window !== 'undefined' ? window : globalThis);
