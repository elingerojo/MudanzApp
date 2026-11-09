# Plan del ciclo D14 — `barra-estados-cierre`: cada destino dice su estado, la bienvenida no duplica la cámara y la captura termina en `Capturados`

> **Estado:** **implementado y validado en local el 2026-11-09; revisión `live` pendiente.** Sin
> migración, sin dependencia nueva y sin rama por ciclo.
> **Hipótesis:** la barra inferior comunica por el fondo si un destino está disponible, si es el
> actual o si está deshabilitado; la bienvenida deja la cámara en el único botón que existe —`Foto`,
> al centro— y la captura que termina lleva sola a `Capturados`, donde el artículo recién creado se
> ve.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:122) filas D12 y D13;
> [`plan-ciclo-d13-inicio-captura`](plan-ciclo-d13-inicio-captura.md:1);
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:224) §4;
> [`wiki-delta`](../.plans/wiki-delta.md:22) §3; [`workflow-ciclos`](workflow-ciclos.md:1).

## 0. Hecho o decisión que abre el corte

| Pregunta                                                  | Respuesta                                                                                                                                                                                                                           | Fecha      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ¿Qué botón toma la foto en `/inicio`?                     | Solo el botón central `Foto` de la barra. El card de arranque queda como instrucción y nombra ese botón; no publica un segundo control de cámara.                                                                                   | 2026-11-09 |
| ¿Cómo se distinguen los estados de los cuatro destinos?   | Por el fondo, con tres estados: **disponible sin seleccionar**, **seleccionado** y **deshabilitado**. Los tokens viven en `shared/src/theme.css` y el texto reusa los que ya existen. El botón central no participa: no es destino. | 2026-11-09 |
| ¿Cuándo se navega a `Capturados`?                         | Al terminar el proceso que inicia `Publicar` o `Solo guardar`, **después** de que el indicador de porcentaje llegue a su destello final.                                                                                            | 2026-11-09 |
| ¿Qué pasa si el proceso termina en error?                 | No se navega: la captura se queda en `Captura` con su mensaje y, cuando aplica, su reintento de foto.                                                                                                                               | 2026-11-09 |
| ¿Qué pasa con el aviso `Publicado. El enlace…` del panel? | Se retira: con la navegación automática nunca llega a verse, y el artículo con su enlace se lee en `Capturados`. Es la corrección del cierre declarado en D13 §0 y §5.4.                                                            | 2026-11-09 |

## 1. Hipótesis y corte

- **Qué compra:** `/inicio` guía sin duplicar la cámara; la barra pinta tres fondos distintos para
  los cuatro destinos y publica el estado en `data-nav-state`; publicar o guardar cierra la captura
  y aterriza en `/capturados` con el resultado a la vista; un error conserva la pantalla.
- **Qué no compra:** no toca `backend`, `shared` (contratos), `shop` ni la base; no añade toasts
  globales (D3), ni un aviso de resultado dentro de `Capturados` —el artículo y su enlace ya están en
  la lista—, ni persiste la foto, ni cambia el formulario, sus campos o sus mensajes.
- **Costo declarado:** una superficie (`frontend`) —paleta compartida, barra, bienvenida y host de la
  captura—, el arnés `e2e/` y el delta de los tiles `A0` y `A2`. **Sin migración y sin dependencias
  nuevas.**

## 2. Fuera de este corte

- Un componente de toasts o un aviso que sobreviva al cambio de ruta: es D3 y no hace falta para
  cumplir el cierre.
- Resaltar en `Capturados` el artículo recién creado: la lista lo pone al tope y conserva su enlace;
  resaltarlo sería un corte propio.
- Persistir la foto o el resultado entre recargas.
- Cambiar el color del botón central `Foto` o de la cabecera: la paleta nueva es solo de estados de
  destino.
- Cambios en `backend`, `shared/s`, `shop` o el mapa de rutas de `wiki`.

## 3. Datos

Sin migración.

## 4. Contrato

Sin contrato nuevo ni modificado. La captura sigue creando el artículo, subiendo las tres variantes y
publicando por las mismas rutas; lo único que cambia es a dónde vuelve la interfaz al terminar.

## 5. Superficies y UI

### 5.1 `/inicio` sin cámara propia

| Zona                    | Contenido                                                                         | `data-testid`                      |
| ----------------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| Cabecera del evento     | Título del trayecto, la instrucción `Documenta cada artículo…` y el enlace        | `event-title`, `event-public-link` |
| Card de arranque        | `Toma una foto del artículo que quieres publicar` y la instrucción de usar `Foto` | `inicio-card`                      |
| Pista de la cámara      | `Usa el botón Foto de la barra para abrir la cámara.`                             | `inicio-camera-hint`               |
| Nota del siguiente paso | Qué ocurre después: el panel pide el título y ofrece el borrador con IA           | `inicio-next-step`                 |

La pantalla deja de montar `<input type="file">`: el único control de cámara es el botón central de
la barra, que vive en la shell y ya entrega la foto a la sesión de captura.

### 5.2 La barra y sus tres estados

| Estado                      | Fondo                  | Texto                               | Marca                                               |
| --------------------------- | ---------------------- | ----------------------------------- | --------------------------------------------------- |
| Disponible, no seleccionado | `--color-nav-rest`     | `--color-ink`                       | `data-nav-state="rest"`                             |
| Seleccionado                | `--color-nav-selected` | `--color-brand-strong`, seminegrita | `data-nav-state="selected"` + `aria-current="page"` |
| Deshabilitado               | `--color-nav-off`      | `--color-muted`, atenuado           | `data-nav-state="off"`                              |

- Los tokens nuevos se declaran en `shared/src/theme.css`, que es la fuente única de tokens de las
  tres superficies; no se declaran tokens locales.
- `Captura` usa `off` sin foto y `rest` con foto; nunca `selected`, porque no es una sección.
- `Ayuda` usa `off`: es un hueco inerte.
- `Foto` no cambia: no es destino y por eso no tiene estado de destino.

### 5.3 El cierre de la captura

- `ItemFormComponent` conserva su orden: sube, espera el destello del indicador y emite `saved`.
- `CaptureComponent` recibe `saved`, refresca la lista del evento y navega a `/capturados`. El error
  no emite `saved`, así que la pantalla no cambia.
- El aviso `capture-saved` del panel se retira, con su enlace y su atajo `Ver capturados`: la
  navegación hace que nunca se vea.

## 6. Cambios por archivo

| Archivo                                            | Cambio                                                                           | Por qué                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `shared/src/theme.css`                             | Tokens `nav-rest`, `nav-selected` y `nav-off`                                    | El fondo comunica el estado               |
| `frontend/src/app/app.html`                        | Fondo por estado y `data-nav-state` en las cuatro posiciones de destino          | Tres estados visibles                     |
| `frontend/src/app/app.ts`                          | `isSection()` y el estado derivado de cada posición                              | La plantilla no repite la condición       |
| `frontend/src/app/app.spec.ts`                     | Estados en los cuatro destinos; `Captura` pasa de `off` a `rest` con foto        | La barra es la evidencia                  |
| `frontend/src/app/events/inicio.component.ts`      | Sin cámara ni navegación: solo cabecera y guía                                   | El botón único es `Foto`                  |
| `frontend/src/app/events/inicio.component.html`    | Card sin `input` ni `label`; pista que nombra el botón de la barra               | No se duplica la cámara                   |
| `frontend/src/app/events/inicio.component.spec.ts` | Publica la guía y no publica control de cámara                                   | La hipótesis se afirma por lo que publica |
| `frontend/src/app/events/capture.component.ts`     | `onSaved()` refresca y navega a `/capturados`; sin aviso ni enlace               | El cierre declarado                       |
| `frontend/src/app/events/capture.component.html`   | Sin bloque `capture-saved`                                                       | Deja de ser alcanzable                    |
| `e2e/support/enter-capture.ts`                     | Entra por `shell-photo-input`, el que abre el botón `Foto`                       | El arnés sigue el flujo real              |
| `e2e/capture.spec.ts`                              | La bienvenida publica la pista; guardar aterriza en `Capturados`                 | La ruta crítica se prueba donde ocurre    |
| `e2e/ai-draft.spec.ts` y `e2e/photos.spec.ts`      | Publicar y guardar cierran en `Capturados`                                       | Coherencia del arnés                      |
| `wiki/src/app/app/a0-superficies/…html`            | Los tres estados de la barra                                                     | Delta del tile de rutas y guardas         |
| `wiki/src/app/app/a2-captura/…html`                | La captura termina en `Capturados`                                               | Delta del tile de la captura              |
| `plans/estructura-ui-navegacion-mudanzapp.md`      | Nota D14 en §4                                                                   | La fuente de forma queda al día           |
| `.plans/resumen-funcional-app-mudanzapp.md`        | §3 y §4: el corte, `nav-states`, y la corrección de `inicio` y `capture-session` | Promoción del ciclo                       |
| `plans/backlog-funcionalidades-pendientes.md`      | Fila D14 con su plan y estado                                                    | Estado consultable                        |
| `plans/plan-ciclo-d14-barra-estados-cierre.md`     | Este plan                                                                        | Registro del corte                        |

## 7. Evidencia

- `/inicio` publica `inicio-card`, `inicio-camera-hint` y `inicio-next-step`, y **no** publica
  `inicio-photo-input` ni `inicio-photo-label`.
- En `/capturados` la barra publica `data-nav-state="selected"` en `Capturados`,
  `data-nav-state="rest"` en `Cuenta`, `data-nav-state="off"` en `Captura` y en `Ayuda`.
- Con foto en la sesión, `Captura` pasa a `data-nav-state="rest"` y conserva `href="/captura"`; nunca
  recibe `aria-current`.
- `Solo guardar` lleva a `/capturados` sin que nadie pulse `Ver capturados`; el artículo aparece con
  su estado `en proceso`.
- `Publicar` lleva a `/capturados` y el artículo aparece como `publicado`.
- Un error en la subida deja la pantalla en `/captura` con su mensaje y su reintento.
- Gate proporcional de [`workflow-ciclos`](workflow-ciclos.md:154) con `shared/`, `frontend/`, `e2e/` y
  `wiki/`: `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run test:web:frontend`, `npm run build:web:frontend`, `npm run test:web:wiki`,
  `npm run build:web:wiki`, `npm run typecheck:e2e`, `npm run db:migrate:test` a mano y
  `npm run test:e2e`.

## 8. Orden de implementación

1. Promoción de D14 en `resumen-funcional` §3 y §4 y fila nueva del backlog.
2. Tokens de estado en `shared/src/theme.css`.
3. Barra de `App`: estados, `data-nav-state` y unit.
4. `InicioComponent` sin cámara, plantilla y unit.
5. Arnés: `enterCapture` y aserciones de la bienvenida.
6. `CaptureComponent`: cierre con navegación y aviso retirado; suites `e2e`.
7. Nota de `estructura-ui` §4 y deltas de `A0` y `A2`.
8. Gate proporcional y `npm run ciclo:check`.

## 9. Rama, base y entrega

- Sin migración propia: solo el `db:migrate:test` que el arnés exige a mano antes de `test:e2e`.
- Sin rama de código por ciclo: el corte sigue la regla de la dev branch única.
- Si la revisión contradice la hipótesis —el cierre navega en error, un estado no se distingue o la
  bienvenida sigue duplicando la cámara— el corte se detiene y la alternativa vuelve al dueño.

## 10. Correcciones de fuente que el corte exige

- `.plans/resumen-funcional-app-mudanzapp.md` §3 y §4: el corte D14, la capacidad `nav-states` y la
  corrección de `inicio` y `capture-session`.
- `plans/backlog-funcionalidades-pendientes.md`: fila D14 y el `Última revisión` del encabezado.
- `plans/estructura-ui-navegacion-mudanzapp.md` §4: nota con los tres estados y el cierre.
- `plans/plan-ciclo-d13-inicio-captura.md` §0 y §5.4: el aviso de cierre que este corte retira queda
  superado por la fila D14 del backlog.
- `wiki/src/app/app/a0-superficies/a0-superficies.component.html` y
  `wiki/src/app/app/a2-captura/a2-captura.component.html`: los dos hechos del corte.

## 11. Riesgos y disparadores

| Riesgo                                                                  | Qué lo dispara                                  | Qué se hará                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| La navegación se adelanta al destello y el botón no llega a completarse | El indicador nunca se ve terminar               | La navegación ocurre en `saved`, que el formulario emite **después** de la espera del destello |
| El error también navega y la persona pierde el mensaje                  | Una subida fallida termina en `Capturados`      | El error no emite `saved`; el mensaje y el reintento quedan en `Captura`                       |
| Los tres fondos no se distinguen en el móvil                            | Dos estados con contraste casi igual            | Fondo, color de texto y peso cambian juntos; el deshabilitado además se atenúa                 |
| El token nuevo se declara local y rompe la fuente única                 | Un `@theme` en `frontend/src/styles.css`        | Los tokens viven solo en `shared/src/theme.css`                                                |
| El arnés sigue entrando por una cámara que ya no existe                 | `enterCapture` en rojo con `inicio-photo-input` | El helper usa `shell-photo-input`, que es el que abre el botón `Foto`                          |

## 12. Alternativas evaluadas

- **Dejar el botón de la bienvenida y añadir estados a la barra:** el dueño pidió un solo botón de
  cámara; dos controles para el mismo acto confunden el primer uso. Descartada.
- **Comunicar el estado solo con color de texto y peso:** «un cambio de color en el fondo» es lo
  pedido y el fondo se lee de un vistazo en el pulgar. Descartada.
- **Navegar desde el formulario al terminar:** el formulario no conoce `Capturados` y se quedaría con
  una ruta de otra pantalla; el host de la captura es quien compone la siguiente superficie.
  Descartada.
- **Conservar el aviso de publicado en el panel y navegar igual:** un bloque que nunca se muestra es
  código muerto que miente al lector. Descartada.

## 13. Cierre

Implementado y validado en local el 2026-11-09, en el commit `254ccf2`. Gate ejecutado, un comando
por invocación: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run test:web:frontend` (32 archivos, 211 pruebas), `npm run build:web:frontend` (inicial de
747.14 kB, con el aviso de presupuesto conocido de D5), `npm run test:web:wiki` (13 pruebas),
`npm run build:web:wiki`, `npm run typecheck:e2e`, `npm run db:migrate:test` a mano antes del arnés y
`npm run test:e2e` (24 pasaron, 42 omitidas por proyecto; la bienvenida pasó en 1.2 s, la foto pesada
en 1.6 s y la captura desde el enlace en 1.6 s). `npm run ciclo:check` cerró en `ok` con los 16
avisos preexistentes.

Lo que se observó: `/inicio` publica la cabecera del evento, la instrucción de documentar, el card
que nombra el botón `Foto` y el siguiente paso, y no monta ningún `input[type="file"]`; las cuatro
posiciones de la barra publican `data-nav-state` —`selected` en la sección actual, `rest` en el
resto y `off` sin foto en `Captura` y siempre en `Ayuda`—; con foto, `Captura` pasa a `rest` con
`href="/captura"` y sin `aria-current`; guardar y publicar refrescan la lista y navegan solos a
`/capturados`, donde el artículo aparece con su estado; y pedir `/captura` sin sesión de foto vuelve
a `/inicio`.

Pendiente con su disparador: la revisión `live` en remoto del dueño. El aviso `Publicado. El
enlace…` del panel se retiró porque la navegación automática lo hacía inalcanzable; si el dueño
quiere leer ese enlace sin pasar por `Capturados`, es un corte propio con su aviso donde corresponda.
