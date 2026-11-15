// Amigos, invitaciones y salas privadas sobre Firebase Realtime Database.
//
// Rutas usadas:
//   users/{uid}                 { name }
//   usernames/{nombre}          uid (para buscar amigos por usuario)
//   presence/{uid}              1 mientras el jugador está conectado
//   friends/{uid}/{amigoUid}    { name, t }
//   requests/{paraUid}/{deUid}  { name, t }   solicitudes de amistad pendientes
//   invites/{paraUid}/{deUid}   { name, party, t }
//   parties/{id}                { host, hostName, mode, t, members:{ uid:{ name, char, team, t } } }
(function (root) {
  const NCHARS = (typeof module !== 'undefined' && module.exports ? require('./characters.js') : root.Characters).list.length;
  const MAX_MEMBERS = 4;
  const norm = (n) => String(n || '').trim().toLowerCase();

  // Escucha una ruta. Devuelve una función para dejar de escuchar.
  function watch(db, path, cb) {
    const ref = db.ref(path);
    const fn = (s) => cb(s.val());
    ref.on('value', fn);
    return () => ref.off('value', fn);
  }

  // Publica el perfil público (para que te encuentren por usuario) y la presencia "conectado".
  function ensureProfile(db, me) {
    const p = db.ref('presence/' + me.uid);
    const mark = () => { p.onDisconnect().remove(); p.set(1); };
    mark();
    const conn = db.ref('.info/connected');
    const fn = (s) => { if (s.val() === true) mark(); };
    conn.on('value', fn);
    const ready = db.ref().update({ ['users/' + me.uid]: { name: me.name }, ['usernames/' + me.name]: me.uid });
    return { ready, stop() { conn.off('value', fn); p.remove(); p.onDisconnect().cancel(); } };
  }

  // ---------- amigos ----------
  async function acceptRequest(db, me, fromUid, fromName, now) {
    const t = (now || Date.now)();
    return db.ref().update({
      ['friends/' + me.uid + '/' + fromUid]: { name: fromName, t },
      ['friends/' + fromUid + '/' + me.uid]: { name: me.name, t },
      ['requests/' + me.uid + '/' + fromUid]: null,
    });
  }
  function declineRequest(db, me, fromUid) { return db.ref('requests/' + me.uid + '/' + fromUid).remove(); }

  // Devuelve 'sent' (solicitud enviada) o 'accepted' (el otro ya te había enviado una).
  async function sendRequest(db, me, name, now) {
    name = norm(name);
    if (!name) throw new Error('Escribí el usuario de tu amigo.');
    if (name === me.name) throw new Error('No podés agregarte a vos mismo.');
    const uid = (await db.ref('usernames/' + name).once('value')).val();
    if (!uid) throw new Error('No existe un jugador con el usuario "' + name + '".');
    if ((await db.ref('friends/' + me.uid + '/' + uid).once('value')).exists()) throw new Error(name + ' ya es tu amigo.');
    if ((await db.ref('requests/' + me.uid + '/' + uid).once('value')).exists()) {
      await acceptRequest(db, me, uid, name, now);
      return 'accepted';
    }
    await db.ref('requests/' + uid + '/' + me.uid).set({ name: me.name, t: (now || Date.now)() });
    return 'sent';
  }
  function removeFriend(db, me, friendUid) {
    return db.ref().update({ ['friends/' + me.uid + '/' + friendUid]: null, ['friends/' + friendUid + '/' + me.uid]: null });
  }

  // ---------- invitaciones ----------
  function sendInvite(db, me, toUid, partyId, now) {
    return db.ref('invites/' + toUid + '/' + me.uid).set({ name: me.name, party: partyId, t: (now || Date.now)() });
  }
  function clearInvite(db, me, fromUid) { return db.ref('invites/' + me.uid + '/' + fromUid).remove(); }

  // ---------- salas privadas ----------
  function teamCounts(members) {
    const c = [0, 0];
    Object.values(members || {}).forEach((m) => { c[m.team === 1 ? 1 : 0]++; });
    return c;
  }

  async function createParty(db, me, char, now) {
    now = now || Date.now;
    const id = me.uid.slice(0, 6) + now().toString(36);
    const ref = db.ref('parties/' + id);
    ref.onDisconnect().remove(); // si el anfitrión se desconecta, la sala se cierra
    await ref.set({ host: me.uid, hostName: me.name, mode: '1v1', t: now(),
      members: { [me.uid]: { name: me.name, char, team: 0, t: now() } } });
    return id;
  }

  async function joinParty(db, me, id, char, now) {
    const party = (await db.ref('parties/' + id).once('value')).val();
    if (!party) throw new Error('La sala ya no existe.');
    const members = party.members || {};
    if (!members[me.uid] && Object.keys(members).length >= MAX_MEMBERS) throw new Error('La sala está llena.');
    const c = teamCounts(members);
    const mine = db.ref('parties/' + id + '/members/' + me.uid);
    mine.onDisconnect().remove();
    await mine.set({ name: me.name, char, team: c[0] <= c[1] ? 0 : 1, t: (now || Date.now)() });
    return id;
  }

  // El anfitrión cierra la sala; un invitado solo sale de ella.
  function leaveParty(db, me, id, isHost) {
    const ref = db.ref(isHost ? 'parties/' + id : 'parties/' + id + '/members/' + me.uid);
    ref.onDisconnect().cancel();
    return ref.remove();
  }
  function kick(db, id, uid) { return db.ref('parties/' + id + '/members/' + uid).remove(); }
  function setMode(db, id, mode) { return db.ref('parties/' + id + '/mode').set(mode === '2v2' ? '2v2' : '1v1'); }
  function setMember(db, id, uid, patch) {
    const upd = {};
    for (const k of Object.keys(patch)) upd['parties/' + id + '/members/' + uid + '/' + k] = patch[k];
    return db.ref().update(upd);
  }

  // Devuelve un texto con el problema que impide empezar, o null si se puede.
  function partyIssue(party) {
    const m = Object.values((party && party.members) || {});
    if (m.length < 2) return 'Hace falta al menos un amigo más en la sala.';
    const perTeam = party.mode === '2v2' ? 2 : 1;
    const t = teamCounts(party.members);
    if (t[0] > perTeam || t[1] > perTeam) {
      return party.mode === '2v2' ? 'En 2v2 cada equipo puede tener hasta 2 jugadores.'
        : 'En 1v1 tiene que haber un jugador en cada equipo.';
    }
    return null;
  }

  // Jugadores de la partida: humanos por equipo y la computadora completa los lugares libres.
  function buildPlayers(party, rng) {
    rng = rng || Math.random;
    const perTeam = party.mode === '2v2' ? 2 : 1;
    const members = Object.entries(party.members || {}).map(([uid, m]) => ({ uid, ...m }))
      .sort((a, b) => a.t - b.t || (a.uid < b.uid ? -1 : 1));
    const players = [];
    for (const team of [0, 1]) {
      const humans = members.filter((m) => (m.team === 1 ? 1 : 0) === team);
      humans.forEach((m) => players.push({ uid: m.uid, name: m.name, char: m.char, team }));
      for (let k = humans.length; k < perTeam; k++) {
        players.push({ uid: 'cpu-' + team + '-' + k, name: 'CPU', char: Math.floor(rng() * NCHARS), team, cpu: 1 });
      }
    }
    return players;
  }

  // Arma la partida y avisa a cada jugador humano (por matches/{uid}).
  async function startParty(db, id, party, opts) {
    opts = opts || {};
    const now = opts.now || Date.now;
    const issue = partyIssue(party);
    if (issue) throw new Error(issue);
    const players = buildPlayers(party, opts.rng);
    const roomId = party.host.slice(0, 6) + now().toString(36);
    const upd = { ['rooms/' + roomId]: { mode: party.mode, host: party.host, t: now(), party: id, players } };
    players.filter((p) => !p.cpu).forEach((p) => { upd['matches/' + p.uid] = roomId; });
    await db.ref().update(upd);
    return roomId;
  }

  const api = { MAX_MEMBERS, watch, ensureProfile, sendRequest, acceptRequest, declineRequest, removeFriend,
    sendInvite, clearInvite, createParty, joinParty, leaveParty, kick, setMode, setMember,
    partyIssue, buildPlayers, startParty };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Social = api;
})(typeof window !== 'undefined' ? window : globalThis);
