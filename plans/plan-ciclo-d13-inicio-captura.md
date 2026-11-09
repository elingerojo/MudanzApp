# Plan del ciclo D13 — `inicio-captura`: la bienvenida guía y la captura vive en su foto

> **Estado:** **implementado y validado en local el 2026-11-09; revisión `live` pendiente.** Sin
> migración, sin dependencia nueva y sin rama por ciclo.
> **Hipótesis:** quien abre la aplicación por primera vez aterriza en una pantalla que le dice qué
> documentar y cómo empezar; la barra solo ofrece `Captura` mientras hay una foto en curso; y el panel
> de captura nunca se abre vacío, porque siempre recibe la foto que se tomó fuera de él.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:137) filas D12 y D13;
> [`plan-ciclo-d12-nav-foto`](plan-ciclo-d12-nav-foto.md:1);
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:192) §4;
> [`wiki-delta`](../.plans/wiki-delta.md:22) §3; [`workflow-ciclos`](workflow-ciclos.md:1).

## 0. Hecho o decisión que abre el corte

| Pregunta                                                     | Respuesta                                                                                                                                                                                                                     | Fecha      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ¿Cuándo se habilita `Captura` en la barra?                   | Inicia **deshabilitado**; se habilita con una foto recién tomada, se mantiene mientras dura la captura —con o sin borrador de IA— y se deshabilita al **Publicar** o al **Guardar**.                                          | 2026-11-09 |
| ¿Qué pasa si la persona sale del panel con la foto a medias? | La foto vive en el buzón durante **toda** la captura: volver a `Captura` reutiliza la misma foto. El formulario la vuelve a optimizar; el ticket anterior se descarta, como hoy.                                              | 2026-11-09 |
| ¿Se puede entrar a `/captura` sin foto?                      | No. Una guarda redirige a `/inicio` cuando el buzón está vacío. Guardar o publicar vacía el buzón, así que recargar después de guardar también vuelve a la bienvenida.                                                        | 2026-11-09 |
| ¿El panel interno conserva su botón de foto?                 | Sí, pero **fijo**: siempre dice `Repetir la foto`. Ya no existe el estado «Toma una foto» dentro del panel porque el panel nunca se abre vacío.                                                                               | 2026-11-09 |
| ¿Cuál es el aterrizaje de la sesión privada?                 | `/inicio`, una pantalla nueva. `Captura` deja de ser el destino por defecto y deja de marcarse como sección activa.                                                                                                           | 2026-11-09 |
| ¿Qué muestra `/inicio`?                                      | La cabecera del evento de [`EventContextComponent`](../frontend/src/app/events/event-context.component.html:1) —título, la instrucción de documentar cada artículo y el enlace público— y un card que invita a tomar la foto. | 2026-11-09 |
| ¿Qué pasa después de guardar o publicar?                     | El panel conserva su aviso con el enlace publicado o el aviso de guardado; `Captura` queda deshabilitado y no se puede reentrar sin una foto nueva.                                                                           | 2026-11-09 |

## 1. Hipótesis y corte

- **Qué compra:** una ruta nueva `/inicio` con la cabecera del evento, la instrucción de documentar y
  un card `Toma una foto del artículo que quieres publicar` que abre la cámara y deja la foto en la
  sesión de captura; el aterrizaje privado deja de ser `/captura`; la barra publica `Captura`
  deshabilitado sin foto y habilitado con ella; `/captura` exige una foto y el panel la reutiliza al
  volver; el botón interno del panel es siempre `Repetir la foto`; guardar o publicar vacía la sesión
  y deshabilita el enlace.
- **Qué no compra:** no cambia el contrato, el backend, `shared`, `shop` ni la base; no agrega un paso
  de IA obligatorio ni bloquea publicar sin borrador; no persiste la foto en disco; no rediseña el
  formulario, sus campos, su orden ni sus mensajes; no toca la guarda de mudanza (D2) ni el selector.
- **Costo declarado:** una superficie (`frontend`) —store, guarda, pantalla nueva, barra, formulario y
  aterrizajes—, el arnés `e2e/` y el delta de los tiles `A0` y `A2` del wiki. **Sin migración y sin
  dependencias nuevas.**

## 2. Fuera de este corte

- Persistir la foto entre recargas o pestañas (`localStorage`, IndexedDB): sigue muriendo con la
  pestaña.
- Recuperar el borrador de IA, el ticket o las variantes ya optimizadas al volver al panel: solo se
  conserva el `File`; la optimización se repite.
- Un botón `Cancelar la captura` o un flujo de descarte explícito; salir del panel no descarta y la
  foto sigue en el buzón.
- Cambiar la regla de la IA: sigue siendo opcional, con un toque y sin bloquear publicar.
- Captura múltiple (A1), estado por foto (A2) y galería pública (A3).
- Cambios en `backend`, `shared`, `shop` o el mapa de rutas de `wiki`.

## 3. Datos

Sin migración.

## 4. Contrato

Sin contrato nuevo ni modificado. Las llamadas de la captura —ticket, escrituras al almacén,
adjunción y borrador— siguen siendo las mismas.

## 5. Superficies y UI

### 5.1 Ruta nueva y guarda

| Ruta       | Guardas                                                           | Componente         | Nota                                         |
| ---------- | ----------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| `/inicio`  | `requireSession` + `requireEventChoice`                           | `InicioComponent`  | Aterrizaje privado; muestra el evento activo |
| `/captura` | `requireSession` + `requireEventChoice` + `requireCaptureSession` | `CaptureComponent` | Sin foto en el buzón redirige a `/inicio`    |

`requireCaptureSession` es una guarda funcional nueva en
`frontend/src/app/events/capture-session.guard.ts`: lee `PhotoInboxStore` y devuelve
`router.createUrlTree(['/inicio'])` cuando no hay foto.

### 5.2 `/inicio`

| Zona                    | Contenido                                                                                | `data-testid`                                             |
| ----------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Cabecera del evento     | Título del trayecto, la instrucción `Documenta cada artículo con una foto…` y el enlace  | `event-title`, `event-public-link`                        |
| Card de arranque        | `Toma una foto del artículo que quieres publicar`, la explicación y el control de cámara | `inicio-card`, `inicio-photo-input`, `inicio-photo-label` |
| Nota del siguiente paso | Qué ocurre después: el panel pide el título y ofrece el borrador con IA                  | `inicio-next-step`                                        |

El control de cámara es un `<input type="file" capture="environment">` oculto con su `<label>`, igual
que el botón de la barra; al elegir archivo deposita la foto en el buzón y navega a `/captura`.

### 5.3 La barra

- `Captura` inicia **deshabilitado**: se pinta como texto con `aria-disabled="true"`, sin enlace, sin
  foco y en tono apagado.
- Con foto en el buzón se pinta como enlace a `/captura` y conserva `data-testid="shell-nav-capture"`.
- Nunca lleva `aria-current`: deja de ser una sección activa. `sectionOf()` ya no devuelve `captura`.
- Las otras cuatro posiciones no cambian: `Capturados`, `Foto`, `Ayuda` y `Cuenta`.

### 5.4 El panel

- El botón interno dice siempre `Repetir la foto`; su `label` no depende de si hay foto.
- El efecto del formulario **espía** el buzón (`peek`), no lo vacía: al volver al panel procesa la
  misma foto si no la procesó ya en esta instancia.
- Guardar o publicar con éxito vacía el buzón; fallar en la subida lo conserva para el reintento.
- Salir del panel conserva la foto; el ticket y la vista previa se descartan como hoy.

## 6. Cambios por archivo

| Archivo                                                     | Cambio                                                                             | Por qué                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| `frontend/src/app/events/photo-inbox.store.ts`              | Deja de ser un buzón de un solo uso: `photo`, `hasPhoto`, `stage`, `peek`, `clear` | La foto dura toda la captura              |
| `frontend/src/app/events/photo-inbox.store.spec.ts`         | La foto no se consume al leerla; se reemplaza; se vacía al guardar                 | La sesión es el hecho nuevo               |
| `frontend/src/app/events/capture-session.guard.ts`          | Guarda nueva: sin foto, `/inicio`                                                  | No existe el panel vacío                  |
| `frontend/src/app/events/capture-session.guard.spec.ts`     | Con foto deja pasar; sin foto redirige                                             | La guarda es la evidencia de la regla     |
| `frontend/src/app/events/inicio.component.ts`               | Pantalla nueva: cámara, staging y navegación                                       | El card de arranque                       |
| `frontend/src/app/events/inicio.component.html`             | Cabecera del evento, instrucción, card y siguiente paso                            | La guía del primer uso                    |
| `frontend/src/app/events/inicio.component.spec.ts`          | Cabecera e instrucción visibles; un archivo entra al buzón y abre el panel         | La hipótesis se afirma por lo que publica |
| `frontend/src/app/app.routes.ts`                            | `/inicio`, guarda de `/captura` y comentarios                                      | El mapa declara el aterrizaje             |
| `frontend/src/app/app.ts`                                   | `Captura` habilitado solo con foto; sin `aria-current`; `sectionOf` sin `captura`  | La barra refleja la sesión                |
| `frontend/src/app/app.html`                                 | Rama de `Captura` deshabilitada y enlace cuando hay foto                           | Dos estados visibles                      |
| `frontend/src/app/app.spec.ts`                              | Captura deshabilitada sin foto, habilitada con foto, sin sección activa            | La barra es la evidencia                  |
| `frontend/src/app/items/item-form.component.ts`             | `peek` en el efecto, `lastAccepted`, staging al retomar, `clear` al terminar       | La foto sobrevive al panel                |
| `frontend/src/app/items/item-form.component.html`           | `Repetir la foto` fijo y pista ajustada                                            | El panel nunca está vacío                 |
| `frontend/src/app/items/item-form.component.spec.ts`        | La foto del buzón sobrevive al formulario; guardar la vacía                        | El cierre de la sesión                    |
| `frontend/src/app/session/redeem.component.ts`              | Aterriza en `/inicio`                                                              | Cambia el destino por defecto             |
| `frontend/src/app/session/oauth-callback.component.ts`      | Aterriza en `/inicio`                                                              | Igual para la vuelta del proveedor        |
| `frontend/src/app/events/event-selector.component.ts`       | Tras elegir, `/inicio`                                                             | Igual para la cuenta con varias mudanzas  |
| `frontend/src/app/session/redeem.component.spec.ts`         | Espera `/inicio`                                                                   | Coherencia del aterrizaje                 |
| `frontend/src/app/session/oauth-callback.component.spec.ts` | Espera `/inicio`                                                                   | Coherencia del aterrizaje                 |
| `frontend/src/app/events/event-selector.component.spec.ts`  | Espera `/inicio`                                                                   | Coherencia del aterrizaje                 |
| `e2e/support/choose-event.ts`                               | La elección aterriza en `/inicio`                                                  | El arnés sigue el flujo nuevo             |
| `e2e/capture.spec.ts` y las suites afectadas                | Esperan `/inicio` y entran a la captura con foto                                   | La ruta crítica se prueba donde ocurre    |
| `wiki/src/app/app/a0-superficies/…html`                     | Aterrizaje `/inicio`, `Captura` condicionado y guarda nueva                        | Delta del tile de rutas y guardas         |
| `wiki/src/app/app/a2-captura/…html`                         | El panel exige foto, `Repetir la foto` fijo y la sesión dura toda la captura       | Delta del tile de la captura              |
| `plans/estructura-ui-navegacion-mudanzapp.md`               | Nota D13 en §4                                                                     | La fuente de forma queda al día           |
| `.plans/resumen-funcional-app-mudanzapp.md`                 | §3 y §4: el corte y las capacidades `inicio` y `capture-session`                   | Promoción del ciclo                       |
| `plans/backlog-funcionalidades-pendientes.md`               | Fila D13 con su plan y estado                                                      | Estado consultable                        |
| `plans/plan-ciclo-d13-inicio-captura.md`                    | Este plan                                                                          | Registro del corte                        |

## 7. Evidencia

- El canje aterriza en `/inicio`, que publica `event-title`, la instrucción de documentar y
  `event-public-link`.
- `/inicio` publica `inicio-photo-label`; un archivo en `inicio-photo-input` lo deja en el buzón y
  navega a `/captura` con `item-photo-preview` visible.
- `shell-nav-capture` inicia con `aria-disabled="true"` y sin `href`; con foto publica un enlace a
  `/captura` y nunca `aria-current`.
- Tras guardar (`item-form-save-only`) o publicar, el buzón queda vacío y `shell-nav-capture` vuelve a
  `aria-disabled="true"`.
- Con foto en curso, navegar a `/cuenta` y volver a `/captura` por la barra reutiliza la misma foto
  (el formulario la vuelve a optimizar y pide ticket).
- `page.goto('/captura')` sin foto aterriza en `/inicio`.
- El botón del panel dice `Repetir la foto` desde el primer montaje.
- Gate proporcional de [`workflow-ciclos`](workflow-ciclos.md:154) con `frontend/`, `e2e/` y `wiki/`:
  `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:web:frontend`,
  `npm run build:web:frontend`, `npm run test:web:wiki`, `npm run build:web:wiki`,
  `npm run typecheck:e2e`, `npm run db:migrate:test` a mano y `npm run test:e2e`.

## 8. Orden de implementación

1. Promoción de D13 en `resumen-funcional` §3 y §4 y fila nueva del backlog.
2. `PhotoInboxStore` como sesión y su unit.
3. `requireCaptureSession` y su unit.
4. `InicioComponent`, su plantilla y su unit.
5. Rutas, aterrizajes (canje, proveedor y selector) y sus units.
6. `ItemFormComponent`: `peek`, foto fija y cierre de sesión; units.
7. Barra de `App`: `Captura` condicionado y sin sección activa; unit.
8. Arnés `e2e/`: aterrizajes y recorrido de la bienvenida.
9. Nota de `estructura-ui` §4 y deltas de `A0` y `A2`.
10. Gate proporcional y `npm run ciclo:check`.

## 9. Rama, base y entrega

- Sin migración propia: solo el `db:migrate:test` que el arnés exige a mano antes de `test:e2e`.
- Sin rama de código por ciclo: el corte sigue la regla de la dev branch única.
- Si la revisión contradice la hipótesis —la captura se abre vacía, la foto se pierde al volver, o la
  barra no refleja la sesión— el corte se detiene y la alternativa vuelve al dueño.

## 10. Correcciones de fuente que el corte exige

- `.plans/resumen-funcional-app-mudanzapp.md` §3 y §4: el corte D13 y las capacidades `inicio` y
  `capture-session`.
- `plans/backlog-funcionalidades-pendientes.md`: fila D13 y el `Última revisión` del encabezado.
- `plans/estructura-ui-navegacion-mudanzapp.md` §4: nota con el aterrizaje `/inicio` y `Captura`
  condicionado.
- `wiki/src/app/app/a0-superficies/a0-superficies.component.html` y
  `wiki/src/app/app/a2-captura/a2-captura.component.html`: los dos hechos del corte.

## 11. Riesgos y disparadores

| Riesgo                                                                | Qué lo dispara                                       | Qué se hará                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Volver al panel reoptimiza la foto y duplica el trabajo               | Una foto pesada se procesa dos veces                 | Es el costo declarado; conservar variantes es un corte propio si pesa                           |
| La foto se pierde al recargar y `Captura` se deshabilita              | Recargar con la captura a medias                     | La sesión vive en memoria; la recarga lleva a la bienvenida, que es el comportamiento declarado |
| El efecto del formulario reprocesa la misma foto al cambiar señales   | El panel pide dos veces el ticket con la misma foto  | `lastAccepted` compara la referencia del `File`, no su contenido                                |
| Una foto rechazada deja el panel vacío con la sesión viva             | Un archivo con tipo no admitido en el primer intento | Si no había foto anterior, se vacía el buzón y el enlace vuelve a deshabilitarse                |
| Guardar con la foto fallida deshabilita el enlace antes de reintentar | Publicar/Solo guardar con `photoFailed`              | El panel conserva su reintento; el enlace deshabilitado no impide reintentar dentro             |
| El aterrizaje nuevo rompe el arnés en muchos casos                    | `test:e2e` en rojo por `/captura`                    | El arnés entra a la captura con una foto en `inicio-photo-input` o con `goto`                   |

## 12. Alternativas evaluadas

- **Mantener `/captura` como aterrizaje y añadir la guía dentro del panel:** no cumple «cancela la
  indicación de que Captura es por defecto» y mantiene el panel vacío. Descartada.
- **Guardar la foto en `localStorage` o IndexedDB para sobrevivir a la recarga:** X8 ya descartó ese
  tipo de estado y una foto es un binario que no debe quedar en disco. Descartada.
- **Conservar el borrador, el ticket y las variantes al volver:** multiplica el estado del formulario
  para un caso poco frecuente; se reabre solo si volver pesa. Descartada.
- **Quitar el botón interno del panel:** retomar la foto es el caso normal después de verla en la
  vista previa, y obligaría a salir y volver. Descartada.

## 13. Cierre

Implementado y validado en local el 2026-11-09, en el commit `1092f45`. Gate ejecutado, un comando
por invocación:
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:web:frontend` (32 archivos,
212 pruebas), `npm run build:web:frontend` (inicial de 740.63 kB, con el aviso de presupuesto conocido
de D5), `npm run test:web:wiki` (13 pruebas), `npm run build:web:wiki`, `npm run typecheck:e2e`,
`npm run db:migrate:test` a mano antes del arnés y `npm run test:e2e` (24 pasaron, 42 omitidas por
proyecto; la prueba nueva de la bienvenida pasó en 1.2 s y la de la foto pesada en 1.7 s).
`npm run ciclo:check` cerró en `ok` con los avisos preexistentes.

Lo que se observó: el canje, la vuelta del proveedor y la elección de mudanza aterrizan en `/inicio`,
que publica el título del evento, la instrucción de documentar y el enlace público; el card pide la
foto y abre el panel; `Captura` inicia con `aria-disabled="true"`, se habilita con la foto, conserva
la sesión al salir y volver, y se deshabilita al guardar; recargar `/captura` después de guardar
devuelve a `/inicio`; el botón interno del panel dice siempre `Repetir la foto`.

Pendiente con su disparador: la revisión `live` en remoto del dueño. Si un día la captura necesita
sobrevivir a una recarga, es un corte propio —hoy la sesión es memoria y muere con la pestaña—.
