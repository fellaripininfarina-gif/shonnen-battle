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

  // Animación que corresponde al estado del luchador. Si el personaje no la tiene, cae en "idle".
  function pickAnim(f, moving) {
    const a = (f.base.sprite && f.base.sprite.anims) || {};
    let name = 'idle';
    if (f.hurtT > 0) name = 'hurt';
    else if (f.dashT > 0) name = 'dash';
    else if (f.shotCd !== undefined && f.shotCd > f.base.shotCd - 0.18) name = 'shoot';
    else if (moving) name = 'run';
    return a[name] ? name : 'idle';
  }

  function frameIndex(anim, t) {
    return Math.floor(t * (anim.fps || 8)) % (anim.frames || 1);
  }

  const fileOf = (dir, file, form) => dir + '/' + file.replace('{f}', form || 0);

  // Dibuja el luchador con su sprite. Devuelve false si no se pudo (para usar el dibujo por defecto).
  function drawFighter(ctx, f, moving, t) {
    const s = f.base.sprite;
    if (!s || !s.anims || !s.anims.idle) return false;
    const anim = s.anims[pickAnim(f, moving)];
    const e = load(fileOf(s.dir, anim.file, f.form));
    if (!e || !e.ok) return false;
    const sc = s.scale || 1, fw = s.frameW, fh = s.frameH;
    const left = Math.cos(f.face) < 0;
    const flip = s.facesLeft ? !left : left;
    ctx.save();
    ctx.translate(f.x, f.y + (s.offsetY || 0));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(e.img, frameIndex(anim, t) * fw, 0, fw, fh, -fw * sc / 2, -fh * sc / 2, fw * sc, fh * sc);
    ctx.restore();
    return true;
  }

  // Dibuja un disparo o rayo con su sprite (rotado hacia donde viaja). Devuelve false si no hay sprite.
  function drawShot(ctx, p, base, t) {
    const d = base[p.type === 'beam' ? 'beam' : 'ki'], s = d && d.sprite;
    if (!s) return false;
    const e = load(fileOf(s.dir || (base.sprite && base.sprite.dir) || '', s.file, 0));
    if (!e || !e.ok) return false;
    const sc = s.scale || 1;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.a || 0);
    ctx.drawImage(e.img, frameIndex(s, t) * s.frameW, 0, s.frameW, s.frameH,
      -s.frameW * sc / 2, -s.frameH * sc / 2, s.frameW * sc, s.frameH * sc);
    ctx.restore();
    return true;
  }

  // Imagen para el selector de luchador: { src, frames, frameW, frameH } o null.
  function thumb(char) {
    const s = char.sprite;
    if (!s || !s.anims || !s.anims.idle) return null;
    const a = s.anims.idle;
    return { src: fileOf(s.dir, a.file, 0), frames: a.frames || 1, frameW: s.frameW, frameH: s.frameH };
  }

  const api = { pickAnim, frameIndex, fileOf, drawFighter, drawShot, thumb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sprites = api;
})(typeof window !== 'undefined' ? window : globalThis);
