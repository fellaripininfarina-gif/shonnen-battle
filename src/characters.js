// Catálogo de personajes jugables. Para sumar uno: agregar una entrada al FINAL de LIST
// (el orden es el id que viaja por la red: no reordenar ni borrar) y, si tiene sprites,
// poner sus archivos en assets/characters/<id>/. Ver "Cómo agregar un personaje" en el README.
//
// Campos de una entrada:
//   id, name, color        identificación y color (HUD, efectos, respaldo si faltan sprites)
//   hp, speed, dmg, shotCd vida, velocidad, daño del disparo y tiempo entre disparos (s)
//   forms                  nombres de las 3 formas (evolucionan en plena batalla)
//   ki   (opcional)        disparo básico: { speed, r, life, dmgMul, sprite }
//   beam (opcional)        habilidad especial (clic derecho / E): { cost, speed, r, life, dmgMul, sprite }
//   sprite (opcional)      { dir, frameW, frameH, scale, facesLeft, offsetY, anims: { idle, run, shoot, dash, hurt } }
//     cada animación: { file, frames, fps }. Los archivos son tiras horizontales: ancho = frameW × frames.
//     En "file" se puede usar {f} para tener un archivo por forma (0, 1, 2), por ejemplo "idle_{f}.png".
//     El sprite de ki/beam: { file, frames, fps, frameW, frameH, scale } (se dibuja rotado hacia donde viaja).
(function (root) {
  const KI_DEFAULT = { speed: 520, r: 7, life: 2, dmgMul: 1 };
  const BEAM_DEFAULT = { cost: 60, speed: 420, r: 18, life: 3, dmgMul: 4 };

  const LIST = [
    { id: 'kaito', name: 'Kaito', color: '#ff7a3d', hp: 100, speed: 210, dmg: 8, shotCd: 0.28,
      forms: ['Base', 'Despertar', 'Ascensión'] },
    { id: 'ryuu', name: 'Ryuu', color: '#e63946', hp: 140, speed: 170, dmg: 10, shotCd: 0.38,
      forms: ['Base', 'Furia', 'Dragón Rojo'] },
    { id: 'sora', name: 'Sora', color: '#4cc9f0', hp: 85, speed: 270, dmg: 6.5, shotCd: 0.2,
      forms: ['Base', 'Relámpago', 'Cielo Roto'] },
    { id: 'mira', name: 'Mira', color: '#b980f0', hp: 95, speed: 215, dmg: 9, shotCd: 0.3,
      forms: ['Base', 'Eclipse', 'Luna Negra'] },
  ];

  // Completa lo que falte con los valores por defecto.
  const list = LIST.map((c) => Object.assign({}, c, {
    ki: Object.assign({}, KI_DEFAULT, c.ki),
    beam: Object.assign({}, BEAM_DEFAULT, c.beam),
  }));

  const api = { list, KI_DEFAULT, BEAM_DEFAULT, MAX: 64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Characters = api;
})(typeof window !== 'undefined' ? window : globalThis);
