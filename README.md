# Shonen Battle

Juego de batallas 2D en tiempo real para el navegador. Proyecto independiente, con personajes y código originales.

Versión publicada: https://fellaripininfarina-gif.github.io/shonnen-battle/

## Cómo jugar

Abrí `index.html` en el navegador (no necesita instalar nada) o entrá a la versión publicada.

Menú:

- **Jugar**: 1v1 y 2v2. Cada uno tiene "online" y "Vs la computadora".
  - Vs la computadora no requiere cuenta.
  - Online requiere registrarse (usuario y contraseña) y busca partida con otros jugadores.
  - **Amigos → Crear sala**: sala privada. El anfitrión invita amigos conectados, elige 1v1 o 2v2 y empieza; cada jugador elige su luchador y su equipo. En 2v2 la computadora completa los lugares libres (por ejemplo, dos amigos en el mismo equipo contra 2 CPU). Al terminar la partida todos vuelven a la sala.
- **Amigos**: agregar por usuario (el otro jugador tiene que aceptar), ver quién está conectado, aceptar o rechazar solicitudes.
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

## Cómo funciona el online

Usa Firebase (Authentication + Realtime Database), sin servidor propio.

- Cuentas: usuario y contraseña. Por detrás se usa el método "Correo/contraseña" con un mail interno (`usuario@shonnenbattle.game`).
- Emparejamiento: cola por modo en la base de datos. El jugador que lleva más tiempo esperando arma la sala.
- Partida: el primer jugador de la sala es el **anfitrión** y corre la simulación; los demás le mandan sus controles y reciben el estado (15 veces por segundo). Si alguien deja de enviar controles, la IA toma su lugar. Si el anfitrión se desconecta, la partida termina.
- Limitación conocida: como el anfitrión simula la partida, un anfitrión tramposo podría alterar el resultado. Para algo competitivo habría que mover la simulación a un servidor.

### Configuración de Firebase

1. `src/config.js` tiene los datos públicos del proyecto `shonnen-battle`. Si la URL de la Realtime Database que muestra la consola es distinta a `databaseURL`, actualizala ahí.
2. En la consola: **Authentication → Método de acceso → Correo electrónico/contraseña** activado.
3. **Realtime Database → Reglas**: pegar el contenido de `database.rules.json` y publicar (las reglas no se publican solas al subir el repo). Después probar en el juego: buscar partida, agregar un amigo y armar una sala.
4. Recomendado: en Google Cloud → Credenciales, restringir la clave de API a los sitios `fellaripininfarina-gif.github.io` y `localhost`.

### Qué protegen las reglas

- Cada jugador solo escribe su propio perfil, presencia y controles; el nombre guardado tiene que coincidir con el de su cuenta.
- Solo se puede agregar a alguien como amigo si hay una solicitud aceptada; las invitaciones exigen amistad.
- Un jugador solo puede mandar a otro a una sala si él es el anfitrión de esa sala; los controles, modos y luchadores se validan.
- Pendiente: no se comprueba que el jugador mandado a una sala esté en la cola o en la sala privada (haría falta un servidor o Cloud Functions).

## Tests

```
npm test
```

o por separado:

```
node test/rules.js   # revisión básica de las reglas de la base de datos
node test/sim.js     # simulación IA vs IA en 1v1 y 2v2
node test/net.js     # emparejamiento y partidas online con una base de datos simulada
node test/social.js  # amigos, invitaciones y salas privadas
node test/smoke.js   # menú y modos contra la computadora con un navegador simulado
node test/e2e.js     # menú + cuenta + partida online completa (anfitrión y cliente)
```

Las pruebas online usan una base de datos simulada (`test/fakedb.js`); no tocan Firebase real.

## Estructura

- `src/game.js`: lógica pura (sin DOM), testeable en Node. Soporta N luchadores en 2 equipos.
- `src/net.js`: cola de partidas, sala, anfitrión y cliente sobre Realtime Database.
- `src/auth.js`: cuentas con usuario y contraseña.
- `src/social.js`: amigos, invitaciones y salas privadas.
- `src/config.js`: configuración pública de Firebase.
- `src/main.js`: menú, dibujo, entrada y bucle principal.
- `src/news.js`: novedades.
- `database.rules.json`: reglas de seguridad de la base de datos.
