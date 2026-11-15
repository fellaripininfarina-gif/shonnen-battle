# Shonen Battle

Juego de batallas 2D en tiempo real para el navegador. Proyecto independiente, con personajes y código originales.

## Cómo jugar

Abrí `index.html` en el navegador (no necesita instalar nada), o entrá a la versión publicada en GitHub Pages.

Menú:

- **Jugar**: 1v1 y 2v2. Cada uno tiene "online" (próximamente) y "Vs la computadora".
- **Novedades**: registro de cambios, una entrada por fecha (`src/news.js`).

| Acción | Control |
| --- | --- |
| Mover | WASD / flechas |
| Apuntar | Mouse |
| Disparar | Click izquierdo / J |
| Esquivar (invulnerable un instante) | Espacio |
| Rayo (cuesta 60 de energía) | Click derecho / E |
| Salir de la partida | Esc |

- Si dos rayos de equipos distintos chocan, tocá J o click lo más rápido que puedas para ganar el choque.
- Al golpear y recibir golpes se carga la barra rosa: al llenarse, tu luchador **evoluciona** en plena batalla.
- En 2v2 el aliado no recibe daño de tus disparos. Gana el equipo que deja sin vida a todos los rivales.

## Tests

```
node test/sim.js     # simulación IA vs IA en 1v1 y 2v2
node test/smoke.js   # menú y dibujo con un navegador simulado
```

## Estructura

- `src/game.js`: lógica pura (sin DOM), testeable en Node. Soporta N luchadores en 2 equipos.
- `src/main.js`: menú, dibujo, entrada y bucle principal.
- `src/news.js`: novedades.

## Pendiente

- Cuentas de jugador (registro) y partidas online 1v1 y 2v2 con Firebase.
