// Sprites de los personajes (solo navegador, pero la elección de animación se puede probar en Node).
// Si un personaje no tiene sprite o el archivo no carga, el juego usa el dibujo por defecto.
(function (root) {
  const cache = {};

  function load(src) {
    if (cache[src]) return cache[src];
    if (typeof Image === 'undefined') return null;
    const e = { img: new Image(), ok: false, bad: false };
    e.img.onload = () => { e.ok = true; };
    e.img.onerror = () => { e.bad = true; };
    e.img.src = src;
    cache[src] = e;
    return e;
  }

  // Animaciones que se prueban, en orden, para cada acción (si el personaje no tiene la primera, usa la siguiente).
  const CHAIN = { shoot: ['shoot'], beam: ['beam', 'shoot'], ult: ['ult', 'beam', 'shoot'], pulse: ['pulse', 'beam', 'shoot'],
    hurt: ['hurt'], dash: ['dash'], run: ['run'], idle: ['idle'] };

  // Animación que corresponde al estado del luchador. Si el personaje no la tiene, cae en una parecida o en "idle".
  function pickAnim(f, moving) {
    const a = (f.base.sprite && f.base.sprite.anims) || {};
    let want = 'idle';
    if (f.hurtT > 0) want = 'hurt';
    else if (f.actT > 0 && f.act) want = f.act;
    else if (f.dashT > 0) want = 'dash';
    else if (moving) want = 'run';
    return (CHAIN[want] || ['idle']).find((n) => a[n]) || 'idle';
  }

  function frameIndex(anim, t) {
    return Math.floor(t * (anim.fps || 8)) % (anim.frames || 1);
  }

  const fileOf = (dir, file, form) => dir + '/' + file.replace('{f}', form || 0);

  // Dibuja un cuadro de una tira, centrado en (0, 0) con el origen desplazado anchorX (0 a 1) del ancho.
  function blit(ctx, e, d, fw, fh, idx, sc, anchorX) {
    ctx.imageSmoothingEnabled = sc < 1; // pixel art nítido al agrandar; suave al achicar
    const w = fw * sc, h = fh * sc;
    ctx.drawImage(e.img, idx * fw, 0, fw, fh, -w * (anchorX === undefined ? 0.5 : anchorX), -h / 2, w, h);
  }

  // Dibuja el luchador con su sprite. Devuelve false si no se pudo (para usar el dibujo por defecto).
  function drawFighter(ctx, f, moving, t) {
    const s = f.base.sprite;
    if (!s || !s.anims || !s.anims.idle) return false;
    const anim = s.anims[pickAnim(f, moving)];
    const e = load(fileOf(s.dir, anim.file, f.form));
    if (!e || !e.ok) return false;
    const left = Math.cos(f.face) < 0;
    const flip = s.facesLeft ? !left : left;
    ctx.save();
    ctx.translate(f.x, f.y + (s.offsetY || 0));
    if (flip) ctx.scale(-1, 1);
    blit(ctx, e, 0, anim.frameW || s.frameW, anim.frameH || s.frameH, frameIndex(anim, t), s.scale || 1);
    ctx.restore();
    return true;
  }

  // Dibuja un disparo, rayo o definitiva con su sprite (rotado hacia donde viaja). Devuelve false si no hay sprite.
  function drawShot(ctx, p, base, t) {
    const d = base[p.type], s = d && d.sprite;
    if (!s) return false;
    const e = load(fileOf(s.dir || (base.sprite && base.sprite.dir) || '', s.file, 0));
    if (!e || !e.ok) return false;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.a || 0);
    blit(ctx, e, 0, s.frameW, s.frameH, frameIndex(s, t), s.scale || 1, s.anchorX);
    ctx.restore();
    return true;
  }

  // Efecto de la habilidad Q (se reproduce una vez, age = segundos desde que se usó).
  // Devuelve 'none' (no tiene sprite: usar el efecto por defecto), 'draw' o 'done'.
  function drawFx(ctx, base, x, y, age) {
    const s = base.q && base.q.fx;
    if (!s) return 'none';
    const idx = Math.floor(age * (s.fps || 10));
    if (idx >= (s.frames || 1)) return 'done';
    const e = load(fileOf(s.dir || (base.sprite && base.sprite.dir) || '', s.file, 0));
    if (!e || !e.ok) return 'none';
    ctx.save(); ctx.translate(x, y);
    blit(ctx, e, 0, s.frameW, s.frameH, idx, s.scale || 1);
    ctx.restore();
    return 'draw';
  }

  // Retrato (cabeza y torso del primer cuadro de idle) dentro de un cuadrado de lado "size". Devuelve false si no hay sprite.
  function drawPortrait(ctx, base, x, y, size) {
    const s = base.sprite;
    if (!s || !s.anims || !s.anims.idle) return false;
    const a = s.anims.idle, e = load(fileOf(s.dir, a.file, 0));
    if (!e || !e.ok) return false;
    const fw = a.frameW || s.frameW, fh = a.frameH || s.frameH, sh = Math.round(fh * 0.55);
    const k = Math.min(size / fw, size / sh);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.img, 0, 0, fw, sh, x + (size - fw * k) / 2, y + (size - sh * k) / 2, fw * k, sh * k);
    return true;
  }

  // Imagen para el selector de luchador: { src, frames, frameW, frameH } o null.
  function thumb(char) {
    const s = char.sprite;
    if (!s || !s.anims || !s.anims.idle) return null;
    const a = s.anims.idle;
    return { src: fileOf(s.dir, a.file, 0), frames: a.frames || 1, frameW: s.frameW, frameH: s.frameH };
  }

  const api = { pickAnim, frameIndex, fileOf, drawFighter, drawShot, drawFx, drawPortrait, thumb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprites = api;
})(typeof window !== 'undefined' ? window : globalThis);
