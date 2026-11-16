// Catálogo de personajes jugables. Para sumar uno: agregar una entrada al FINAL de LIST
// (el orden es el id que viaja por la red: no reordenar ni borrar) y, si tiene sprites,
// poner sus archivos en assets/characters/<id>/. Ver "Cómo agregar un personaje" en el README.
//
// Campos de una entrada:
//   id, name, color        identificación y color (HUD, efectos, respaldo si faltan sprites)
//   hp, speed, dmg, shotCd vida, velocidad, daño base y tiempo entre ataques básicos (BASIC_CD = 0,5 s para todos)
//   forms                  nombres de las 3 formas (evolucionan en plena batalla)
//   ki   (opcional)        disparo básico: { speed, r, life, dmgMul, sprite }
//   beam (opcional)        ataque fuerte (clic derecho): { cost, speed, r, life, dmgMul, sprite }
//   q    (opcional)        habilidad de área (Q): { cost, cd, radius, dmgMul, push, fx }  fx = efecto que se dibuja al usarla
//   ult  (opcional)        definitiva (E, usa la barra de ulti que se carga golpeando y recibiendo golpes): { r, speed, life, dmgMul, sprite }
//   kit  (opcional)        nombres de las habilidades para mostrar en el selector: { lmb, rmb, esp, q, e }
//   (esquivar con Espacio es igual para todos)
//   sprite (opcional)      { dir, frameW, frameH, scale, facesLeft, offsetY, anims: { idle, run, shoot, dash, hurt } }
//     cada animación: { file, frames, fps }. Los archivos son tiras horizontales: ancho = frameW × frames.
//     En "file" se puede usar {f} para tener un archivo por forma (0, 1, 2), por ejemplo "idle_{f}.png".
//     Cada animación puede traer su propio frameW/frameH. Animaciones: idle (obligatoria), run, shoot, beam, dash, hurt, pulse;
//     si falta una, se usa la siguiente parecida (ult → beam → shoot → idle).
//     El sprite de ki/beam/ult: { dir, file, frames, fps, frameW, frameH, scale, anchorX } (se dibuja rotado hacia donde
//     viaja; anchorX es qué parte del ancho queda sobre la posición del disparo: 0.9 = la cabeza).
(function (root) {
  const KI_DEFAULT = { speed: 520, r: 7, life: 2, dmgMul: 1.8 }; // el ataque básico sale cada BASIC_CD segundos
  const BEAM_DEFAULT = { cost: 60, speed: 420, r: 18, life: 3, dmgMul: 4 };
  const BASIC_CD = 0.5; // segundos entre ataques básicos (mantener el click dispara solo; clickear más rápido no acelera)
  const Q_DEFAULT = { cost: 30, cd: 4, radius: 110, dmgMul: 2.5, push: 90 };   // onda de ki alrededor del luchador
  const ULT_DEFAULT = { r: 40, speed: 560, life: 2.2, dmgMul: 9 };              // rayo definitivo que atraviesa

  const LIST = [
    { id: 'kaito', name: 'Kaito', color: '#ff7a3d', hp: 100, speed: 210, dmg: 8, shotCd: BASIC_CD,
      forms: ['Base', 'Despertar', 'Ascensión'],
      kit: { lmb: 'Chispa', rmb: 'Rayo solar', esp: 'Esquiva', q: 'Llamarada', e: 'Supernova' } },
    { id: 'ryuu', name: 'Ryuu', color: '#e63946', hp: 140, speed: 170, dmg: 10, shotCd: BASIC_CD,
      forms: ['Base', 'Furia', 'Dragón Rojo'],
      kit: { lmb: 'Garra', rmb: 'Rugido', esp: 'Esquiva', q: 'Sacudida', e: 'Dragón rojo' } },
    { id: 'sora', name: 'Sora', color: '#4cc9f0', hp: 85, speed: 270, dmg: 6.5, shotCd: BASIC_CD,
      forms: ['Base', 'Relámpago', 'Cielo Roto'],
      kit: { lmb: 'Destello', rmb: 'Relámpago', esp: 'Esquiva', q: 'Trueno', e: 'Tormenta' } },
    { id: 'mira', name: 'Mira', color: '#b980f0', hp: 95, speed: 215, dmg: 9, shotCd: BASIC_CD,
      forms: ['Base', 'Eclipse', 'Luna Negra'],
      kit: { lmb: 'Luz lunar', rmb: 'Rayo eclipse', esp: 'Esquiva', q: 'Pulso lunar', e: 'Luna negra' } },
  ];

  // ---------- Goku UI ----------
  // Sprites generados con tools/build-goku-ui.py. Forma 0 = Base, 1 = UI Sign (aura), 2 = Ultra Instinto (pelo plateado).
  const DIR = 'assets/characters/goku-ui';
  const GOKU = {
    id: 'goku-ui', name: 'Goku UI', color: '#aab8ff', hp: 100, speed: 235, dmg: 8.5, shotCd: BASIC_CD,
    forms: ['Base', 'UI Sign', 'Ultra Instinto'],
    kit: { lmb: 'Ráfaga de ki', rmb: 'Kamehameha', esp: 'Esquiva instantánea', q: 'Onda de ki', e: 'Kamehameha definitivo' },
    ki: { speed: 560, r: 7, life: 2, dmgMul: 1.8,
      sprite: { dir: DIR, file: 'ki.png', frames: 2, fps: 14, frameW: 54, frameH: 29, scale: 1, anchorX: 0.8 } },
    beam: { cost: 60, speed: 430, r: 18, life: 3, dmgMul: 4.5,
      sprite: { dir: DIR, file: 'beam.png', frames: 4, fps: 16, frameW: 172, frameH: 60, scale: 0.55, anchorX: 0.9 } },
    q: { cost: 30, cd: 4, radius: 115, dmgMul: 2.5, push: 100,
      fx: { dir: DIR, file: 'pulse_fx.png', frames: 4, fps: 10, frameW: 87, frameH: 80, scale: 2.6 } },
    ult: { r: 60, speed: 600, life: 2.2, dmgMul: 10,
      sprite: { dir: DIR, file: 'ult.png', frames: 3, fps: 16, frameW: 213, frameH: 143, scale: 1, anchorX: 0.9 } },
    sprite: {
      dir: DIR, frameW: 38, frameH: 66, scale: 1.4,
      anims: {
        idle: { file: 'idle_{f}.png', frames: 3, fps: 5, frameW: 38, frameH: 66 },
        run: { file: 'run_{f}.png', frames: 4, fps: 10, frameW: 42, frameH: 64 },
        shoot: { file: 'shoot_{f}.png', frames: 4, fps: 18, frameW: 42, frameH: 64 },
        beam: { file: 'beam_{f}.png', frames: 8, fps: 14, frameW: 86, frameH: 64 },
        dash: { file: 'dash_{f}.png', frames: 2, fps: 16, frameW: 54, frameH: 54 },
        hurt: { file: 'hurt_{f}.png', frames: 2, fps: 14, frameW: 42, frameH: 56 },
        pulse: { file: 'pulse.png', frames: 2, fps: 12, frameW: 120, frameH: 90 },
      },
    },
  };

  LIST.push(GOKU);

  // Completa lo que falte con los valores por defecto.
  const list = LIST.map((c) => Object.assign({}, c, {
    ki: Object.assign({}, KI_DEFAULT, c.ki),
    beam: Object.assign({}, BEAM_DEFAULT, c.beam),
    q: Object.assign({}, Q_DEFAULT, c.q),
    ult: Object.assign({}, ULT_DEFAULT, c.ult),
  }));

  const api = { list, KI_DEFAULT, BEAM_DEFAULT, Q_DEFAULT, ULT_DEFAULT, MAX: 64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Characters = api;
})(typeof window !== 'undefined' ? window : globalThis);
