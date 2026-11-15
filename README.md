# Shonen Battle

Juego de batallas 2D en tiempo real para el navegador. Proyecto independiente, con personajes y código originales.

## Cómo jugar

Abrí `index.html` en el navegador (no necesita instalar nada).

| Acción | Control |
| --- | --- |
| Mover | WASD / flechas |
| Apuntar | Mouse |
| Disparar | Click izquierdo / J |
| Esquivar (invulnerable un instante) | Espacio |
| Rayo (cuesta 60 de energía) | Click derecho / E |

- Si dos rayos chocan, tocá J o click lo más rápido que puedas para ganar el choque.
- Al golpear y recibir golpes se carga la barra rosa: al llenarse, tu luchador **evoluciona** en plena batalla.

## Tests

```
node test/sim.js
```

## Estructura

- `src/game.js`: lógica pura (sin DOM), testeable en Node.
- `src/main.js`: dibujo, entrada y bucle principal.
