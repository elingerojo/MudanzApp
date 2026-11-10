# Plan del ciclo D15 — `evento-recordado`: el último evento usado es el default de este navegador

> **Estado:** **plan ejecutable, en ejecución por instrucción del dueño (2026-11-10).** Sin migración,
> sin dependencia nueva y sin rama por ciclo.
> **Hipótesis:** una cuenta con dos o más membresías elige en `/eventos` solo la primera vez en cada
> navegador; el evento elegido se recuerda en `localStorage` y vuelve a ser el activo al recargar o al
> volver otro día, mientras siga en la lista de membresías de la sesión.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:144) fila D15;
> [`plan-ciclo-d2`](plan-ciclo-d2-selector-evento.md:189) §11;
> [`wiki-delta`](../.plans/wiki-delta.md:22) §3;
> [`workflow-ciclos`](workflow-ciclos.md:1).

## 0. Hecho o decisión que abre el corte

| Pregunta                                               | Respuesta                                                                                                                                                    | Fecha      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| ¿Dónde se recuerda la elección?                        | En `localStorage`, clave `mudanzapp.event`. Es memoria de este navegador, no un hecho del borde.                                                             | 2026-11-10 |
| ¿Qué se guarda?                                        | Solo el `eventId`. El trayecto, el rol y el estado se siguen leyendo de `/auth/session` en cada visita.                                                      | 2026-11-10 |
| ¿Cuándo se valida?                                     | En cada lectura de identidad: el recordado solo cuenta si aparece en `events()`. Un identificador inventado o de una membresía retirada no se usa.           | 2026-11-10 |
| ¿Qué pasa si el recordado ya no está en la lista?      | Se ignora. Con dos o más membresías vuelve a aparecer `/eventos` una vez; con una sola, el evento activo es esa única membresía.                             | 2026-11-10 |
| ¿Se borra al cerrar sesión?                            | No. Es una preferencia del navegador y se revalida contra la identidad siguiente; si no la alcanza, no se usa.                                               | 2026-11-10 |
| ¿Dónde se cambia de mudanza?                           | En la Cuenta, con el enlace `Cambiar de mudanza` a `/eventos`. La guarda conserva `/eventos` para la primera visita de cada navegador.                       | 2026-11-10 |
| ¿Qué pasa si el navegador niega `localStorage`?        | La elección vive en memoria mientras dure la pestaña; el arranque no se rompe y el resto del comportamiento es el de D2.                                     | 2026-11-10 |
| ¿Cambia el contrato, la base o el contenido del panel? | No. Solo cambia el lugar donde `SessionStore` recuerda la elección; captura, lista y administración siguen leyendo `activeEvent`/`activeEventId`.            | 2026-11-10 |
| ¿D15 reabre D2?                                        | No. D2 sigue `cerrada 1cf135d`; D15 corrige su cláusula «la elección vive en memoria mientras dura la visita» y cumple el disparador de `plan-ciclo-d2` §11. | 2026-11-10 |

## 1. Hipótesis y corte

- **Qué compra:** el evento elegido deja de perderse en cada recarga. `SessionStore` restaura el
  identificador recordado junto con la credencial, lo valida contra la lista de membresías que publica
  `/auth/session` y lo convierte en `activeEvent` cuando sigue siendo visible. La cuenta con varias
  mudanzas elige en `/eventos` una sola vez por navegador; después cambia desde la Cuenta, y una
  recarga de un destino privado conserva la mudanza en vez de volver a preguntar.
- **Qué no compra:** no sincroniza la elección entre dispositivos ni cuentas; no cambia el contrato de
  `/auth/session`; no agrega `eventId` al canje ni a `POST /auth/sessions`; no introduce caducidad,
  historial ni limpieza programada de la clave; no cambia el contenido de captura, lista, ficha o
  administración; no toca `backend`, `shared`, `shop` ni las rutas de `wiki`.
- **Costo declarado:** una superficie (`frontend`) —`SessionStore` y sus pruebas—, el arnés `e2e/`,
  la nota de `estructura-ui` §4, el delta del tile `A0` del wiki y el estado del backlog. **Sin
  migración y sin dependencias nuevas.**

## 2. Fuera de este corte

- Persistir la elección en el borde (`POST /auth/sessions`, canje o una columna de cuenta).
- Sincronizar la elección entre navegadores, dispositivos o cuentas.
- Caducidad, versión o historial de la clave `mudanzapp.event`.
- Borrar automáticamente un identificador recordado que la sesión ya no alcanza: se ignora, no se
  reescribe por inferencia.
- Cambiar la regla de `requiresEventChoice` más allá de reconocer el evento recordado.
- Un conmutador de mudanza dentro de las pantallas de captura, lista o administración.
- Cambios en `backend`, `shared`, `shop`, la aplicación de `wiki` o sus rutas.
- Reabrir el retiro de membresía (E2), la expulsión por enlace (E3) o el evento sin rey (E4).
- Cambiar el destino de aterrizaje después de elegir: sigue siendo `/inicio` (D13).

## 3. Datos

Sin migración. Ninguna tabla ni columna cambia. La lista de membresías sigue llegando de
`GET /auth/session`; la elección es estado de presentación de este navegador.

## 4. Contrato

Sin contrato nuevo ni modificado. `CurrentIdentity.events` sigue siendo la única fuente de la lista y
del rol; el navegador solo recuerda cuál de esos identificadores fue el último usado.

## 5. Superficies y UI

### 5.1 Regla del evento activo

`SessionStore.activeEvent` pasa a ser:

1. la membresía **recordada** en `localStorage`, si sigue apareciendo en `events()`;
2. la **única** membresía visible, cuando solo hay una;
3. `null` cuando hay dos o más y no hay un recordado válido.

`requiresEventChoice` se conserva: es verdadero cuando hay dos o más membresías y `activeEvent` es
`null`. Por eso `/eventos` aparece solo en la primera visita de cada navegador o cuando el evento
recordado dejó de ser visible.

### 5.2 Pantallas

- `/eventos` conserva su forma de D2: lista las membresías con trayecto y rol, marca la activa y al
  elegir navega a `/inicio`. La única diferencia es que, al volver desde la Cuenta, la elección queda
  escrita en el navegador.
- `Cuenta` conserva `Cambiar de mudanza` cuando hay dos o más membresías y el aviso `Elegir mudanza`
  cuando no hay evento activo. No cambia su plantilla.
- La barra inferior, la portada y el card de invitación siguen leyendo `activeEvent`; ningún otro
  consumidor cambia.

## 6. Cambios por archivo

| Archivo                                                         | Cambio                                                                                 | Por qué                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `frontend/src/app/session/session.store.ts`                     | Clave `mudanzapp.event`, señal recordada, restauración, escritura y validación         | Un solo hecho manda: el último evento usado de este navegador    |
| `frontend/src/app/session/session.store.spec.ts`                | Restauración, validación, escritura, elección inválida y supervivencia al cierre       | Evidencia del store                                              |
| `e2e/event-selector.spec.ts`                                    | La recarga conserva la elección; la Cuenta cambia y el cambio sobrevive a otra recarga | La hipótesis se recorre por la superficie real                   |
| `plans/estructura-ui-navegacion-mudanzapp.md`                   | Nota del corte D15 en §4                                                               | La fuente de forma deja de decir que la elección vive en memoria |
| `wiki/src/app/app/a0-superficies/a0-superficies.component.html` | Claim del evento activo: recordado válido, selector solo la primera vez                | Delta del tile dueño de las rutas y la sesión                    |
| `.plans/resumen-funcional-app-mudanzapp.md`                     | §4: la capacidad `evento-recordado` y la corrección de `event-selector`                | Promoción del ciclo (ya declarada)                               |
| `plans/backlog-funcionalidades-pendientes.md`                   | Fila D15 con su plan y el encabezado al día                                            | Estado consultable                                               |
| `plans/plan-ciclo-d15-evento-recordado.md`                      | Este plan                                                                              | Apertura y cierre del ciclo                                      |

## 7. Evidencia

- `restore` recupera la credencial y el evento recordado de `localStorage`; con dos membresías el
  recordado válido es `activeEvent` y `requiresEventChoice` es `false`.
- Un identificador recordado que no aparece en `events()` se ignora: con dos membresías
  `activeEvent` es `null` y `requiresEventChoice` es `true`; con una sola, gana la única membresía.
- `selectEvent` escribe `mudanzapp.event` después de validar que la sesión alcanza la membresía; una
  elección inválida devuelve `false` y no escribe.
- `clear` retira la credencial pero conserva el evento recordado del navegador.
- El e2e `event-selector` demuestra que una recarga de `/capturados` conserva la mudanza elegida; que
  `Cuenta → Cambiar de mudanza` permite elegir otra; y que una segunda recarga conserva la nueva.
- Gate proporcional de `workflow-ciclos` §7 con `frontend/`, `e2e/` y `wiki/` tocados:
  `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:web:frontend`,
  `npm run build:web:frontend`, `npm run test:web:wiki`, `npm run build:web:wiki`,
  `npm run typecheck:e2e`, `npm run db:migrate:test` y `npm run test:e2e`.

## 8. Orden de implementación

1. Plan D15 desde la plantilla y fila del backlog en `planeada`.
2. `SessionStore`: clave, restauración, `activeEvent`, `selectEvent` y `clear`.
3. Pruebas unitarias del store.
4. Arnés `e2e/event-selector`: recarga que conserva y cambio desde la Cuenta.
5. Nota de `estructura-ui` §4 y delta del tile `A0`.
6. Gate proporcional y cierre.

## 9. Rama, base y entrega

- Sin migración: no se aplica ningún `db:migrate:*` salvo el del arnés (`db:migrate:test`), a mano
  antes de `test:e2e`.
- Sin rama de código por ciclo: el corte sigue la regla de la dev branch única.
- Si la revisión contradice la hipótesis —una recarga sigue preguntando con un recordado válido, o un
  recordado inválido se usa en silencio—, el corte se detiene y la alternativa vuelve al dueño antes
  de seguir.

## 10. Correcciones de fuente que el corte exige

- `plans/estructura-ui-navegacion-mudanzapp.md` §4: la nota de D2 decía que la elección vive en
  memoria; se corrige con la nota de D15.
- `wiki/src/app/app/a0-superficies/a0-superficies.component.html`: el claim de la elección y la
  recarga; la cabecera de frescura conserva `254ccf2 · 2026-11-09` (última verificación externa,
  D14 `live`), porque este delta no se cita a sí mismo.
- `plans/backlog-funcionalidades-pendientes.md`: la fila D15 deja `hipótesis` y apunta a este plan;
  el encabezado registra el ciclo.
- `.plans/resumen-funcional-app-mudanzapp.md` §4: `evento-recordado` describe la capacidad en
  presente y `event-selector` deja de afirmar que la elección vive en memoria.

## 11. Riesgos y disparadores

| Riesgo                                                | Qué lo dispara                                                         | Qué se hará                                                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Un evento recordado de otra cuenta se usa en silencio | Cambiar de cuenta en el mismo navegador y aterrizar en un evento ajeno | Se valida contra `events()` en cada lectura; con dos o más y sin coincidencia, selector        |
| Una membresía retirada deja la superficie sin evento  | El recordado ya no aparece en la lista                                 | Se ignora; con dos o más, `/eventos` una vez; con una, gana la única                           |
| La clave se escribe sin validar                       | Un `selectEvent` con un identificador inventado                        | `selectEvent` devuelve `false` y no escribe; la prueba lo afirma                               |
| El navegador niega el almacenamiento                  | Modo privado o política del navegador                                  | La elección vive en memoria; `restore` y `selectEvent` degradan sin romper el arranque         |
| La recarga sigue preguntando aunque haya recordado    | La guarda lee el store antes de restaurar la clave                     | `restore` corre en el inicializador y la guarda espera a que la identidad resuelva             |
| El e2e acumula membresías del doble `fake`            | La base del arnés conserva eventos de corridas anteriores              | El caso elige por trayecto, no por posición, y afirma la persistencia sobre su propia elección |

## 12. Alternativas evaluadas

- **`eventId` opcional en `POST /auth/sessions`:** congela la elección en la sesión, pero no resuelve
  el cambio desde la Cuenta sin volver a entrar y obliga a cambiar el contrato. Descartada.
- **`sessionStorage`:** recuerda solo la pestaña y no cumple «volver otro día». Descartada.
- **Cookie:** mismo efecto que `localStorage` con más ceremonia y sin ventaja para un identificador no
  secreto. Descartada.
- **Sincronizar la elección en la base:** convertiría una preferencia de presentación en un hecho del
  borde y exigiría migración y contrato. Descartada; queda fuera de alcance.
- **No recordar y pedir siempre:** es el comportamiento de D2; la recarga vuelve a preguntar y es lo
  que D15 corrige. Descartada.

## 13. Cierre

Ejecutado el 2026-11-10. Evidencia en verde: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run test:web:frontend` (32 archivos, 216 pruebas),
`npm run build:web:frontend`, `npm run test:web:wiki` (13 pruebas), `npm run build:web:wiki`,
`npm run typecheck:e2e`, `npm run db:migrate:test` y `npm run test:e2e` (24 pasaron, 42 omitidas
por proyecto: las suites de `shop` y `wiki` y el humo de las tres superficies).

Lo que la evidencia demuestra: el store restaura el evento recordado junto con la credencial y lo
usa como activo solo si aparece en `events()`; un recordado ajeno a la lista se ignora y, con dos
membresías, devuelve a `/eventos` una vez; `selectEvent` escribe `mudanzapp.event` solo tras validar
la membresía; `clear` retira la credencial y conserva la preferencia del navegador. El e2e
`event-selector` confirma que una recarga de `/capturados` conserva la mudanza elegida, que el
cambio desde `Cuenta → Cambiar de mudanza` navega a la nueva y que una segunda recarga la mantiene;
sin un recordado válido, el navegador vuelve a ver el selector.

Pendiente: el commit convencional y la revisión `live` del dueño. El árbol de trabajo mezcla cambios
ajenos a D15, así que el commit del ciclo requiere separar esos cambios primero.
