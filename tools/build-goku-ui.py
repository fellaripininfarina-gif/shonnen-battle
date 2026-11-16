#!/usr/bin/env python3
"""Arma las tiras de sprites de Goku UI a partir de los cuadros sueltos (un PNG por cuadro).

Uso: python3 tools/build-goku-ui.py <carpeta movimientos> <carpeta poderes> <carpeta de salida>
Ejemplo: python3 tools/build-goku-ui.py movimientos-goku-ui poderes-goku-ui assets/characters/goku-ui

- Los cuadros vienen ampliados (cada píxel del dibujo es un bloque NxN): se reducen a su tamaño original.
- Cada animación se alinea (pies abajo, centro o cuerpo fijo) y se exporta como tira horizontal.
- Las formas se generan desde los mismos cuadros: 0 = Base, 1 = UI Sign (aura celeste),
  2 = Ultra Instinto (pelo plateado + aura clara; el idle usa los cuadros plateados originales).
Imprime la configuración de cada tira (frames, frameW, frameH) para pegar en src/characters.js.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image

PAD = 4  # margen para el aura

def block(a):
    h, w = a.shape[:2]
    best = 1
    for k in range(2, 60):
        if w % k or h % k: continue
        d = a[::k, ::k]
        if np.array_equal(np.repeat(np.repeat(d, k, 0), k, 1), a): best = k
    return best

def load(folders, num):
    for d in folders:
        for f in glob.glob(os.path.join(d, '%03d - *.png' % num)):
            a = np.array(Image.open(f).convert('RGBA')); k = block(a)
            return Image.fromarray(a[::k, ::k])
    raise SystemExit('falta el cuadro %03d' % num)

def bbox(im):
    a = np.array(im)[..., 3]
    ys, xs = np.where(a > 0)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

# ---------- formas ----------
def glow(im, color, strong=230, weak=110):
    """Aura: dos anillos de color alrededor de la silueta."""
    a = np.array(im); al = a[..., 3] > 0
    def dil(m):
        o = m.copy(); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]; return o
    r1 = dil(al) & ~al; r2 = dil(dil(al)) & ~dil(al)
    out = a.copy()
    out[r2] = [*color, weak]; out[r1] = [*color, strong]
    return Image.fromarray(out)

def silver_hair(im):
    """Pelo plateado: pinta de plata el interior del pelo (negro que no toca el borde ni la piel)."""
    a = np.array(im).copy(); h, w = a.shape[:2]
    rgb = a[..., :3].astype(int); al = a[..., 3] > 0
    skin = (rgb[..., 0] > 225) & (rgb[..., 1] > 170) & (rgb[..., 2] > 120) & (rgb[..., 2] < 215) & al
    rows = np.where(skin.sum(1) >= 2)[0]
    if not len(rows): return im
    y0 = rows[0]
    dark = (rgb.max(-1) < 70) & al
    def nb(m):  # algún vecino (4) cumple m
        o = np.zeros_like(m); o[1:] |= m[:-1]; o[:-1] |= m[1:]; o[:, 1:] |= m[:, :-1]; o[:, :-1] |= m[:, 1:]; return o
    edge = nb(~al) | nb(skin)
    hair = dark & ~edge
    hair[y0 + 9:] = False
    ys, xs = np.where(hair)
    top = ys.min() if len(ys) else 0
    for y, x in zip(ys, xs):
        t = (y - top) / max(1, (y0 + 9 - top))
        base = np.array([232, 236, 255]) * (1 - t) + np.array([140, 144, 190]) * t
        if (x + y) % 5 == 0: base = base * 0.88
        a[y, x, :3] = base.astype(np.uint8)
    return Image.fromarray(a)

# ---------- tiras ----------
def cell_size(frames, mode):
    ws = [f.size[0] for f in frames]; hs = [f.size[1] for f in frames]
    if mode == 'body':  # el cuerpo (~30 px) queda fijo en el centro y el efecto sale hacia la derecha
        cw = 2 * (max(ws) - 15) + 2 * PAD
    else:
        cw = max(ws) + 2 * PAD
    ch = max(hs) + 2 * PAD
    return cw + cw % 2, ch + ch % 2

def strip(frames, mode, cw, ch):
    """Alinea cada cuadro en una celda de cw x ch y los junta en una tira horizontal.
    mode: 'feet' (pies abajo), 'center', 'body' (cuerpo fijo), 'head' (pegado a la derecha, centrado en alto)."""
    s = Image.new('RGBA', (cw * len(frames), ch), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        w, h = f.size
        x = {'body': cw // 2 - 15, 'head': cw - w}.get(mode, (cw - w) // 2)
        y = ch - PAD - h if mode in ('feet', 'body') else (ch - h) // 2
        s.paste(f, (i * cw + x, y), f)
    return s

# (nombre, cuadros, alineación, fps, cambia con la forma)
ANIMS = [
    ('idle',  [80, 81, 80],          'feet',   5,  True),
    ('run',   [138, 139, 141, 140],  'feet',   10, True),
    ('shoot', [157, 158, 158, 157],  'feet',   18, True),
    ('beam',  list(range(97, 105)),  'body',   14, True),
    ('dash',  [36, 35],              'center', 16, True),
    ('hurt',  [122, 123],            'feet',   14, True),
    ('pulse', [142, 143],            'feet',   12, False),
]
SHOTS = [  # (clave, archivo, cuadros, fps, alineación)
    ('ki',        'ki',       [163, 164],           14, 'head'),
    ('beam_shot', 'beam',     [105, 106, 107, 108], 16, 'head'),
    ('ult_shot',  'ult',      [249, 250, 251],      16, 'head'),
    ('pulse_fx',  'pulse_fx', [109, 110, 171, 172], 10, 'center'),
]

def main(mov, pod, out):
    os.makedirs(out, exist_ok=True)
    folders = [mov, pod]
    G = lambda n: bbox(load(folders, n))
    cfg = {}
    for name, nums, mode, fps, forms in ANIMS:
        base = [G(n) for n in nums]
        variants = [base]
        if forms:
            variants.append([glow(f, (76, 201, 240)) for f in base])
            if name == 'idle':  # cuadros plateados originales
                variants.append([glow(G(n), (205, 225, 255)) for n in (3, 4, 5)])
            else:
                variants.append([glow(silver_hair(f), (205, 225, 255)) for f in base])
        cw, ch = cell_size([f for v in variants for f in v], mode)
        for i, v in enumerate(variants):
            strip(v, mode, cw, ch).save(os.path.join(out, ('%s_%d.png' % (name, i)) if forms else (name + '.png')))
        cfg[name] = {'file': (name + '_{f}.png') if forms else (name + '.png'), 'frames': len(nums), 'fps': fps,
                     'frameW': cw, 'frameH': ch}
    for key, fn, nums, fps, mode in SHOTS:
        fr = [G(n) for n in nums]
        cw = max(f.size[0] for f in fr); ch = max(f.size[1] for f in fr)
        strip(fr, mode, cw, ch).save(os.path.join(out, fn + '.png'))
        cfg[key] = {'file': fn + '.png', 'frames': len(nums), 'fps': fps, 'frameW': cw, 'frameH': ch}
    print(json.dumps(cfg, indent=1))

if __name__ == '__main__':
    if len(sys.argv) != 4: raise SystemExit(__doc__)
    main(*sys.argv[1:])
