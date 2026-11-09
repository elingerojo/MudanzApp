# Plan del ciclo D12 — `nav-foto`: la cámara en la barra y el panel de siempre

> **Estado:** **plan ejecutable, sin ejecutar.** Abierto por decisión del dueño del 2026-11-09. Sin
> migración, sin dependencia nueva y sin rama por ciclo.
> **Hipótesis:** con un botón redondo `Foto` al centro de la barra inferior, cualquier pantalla privada
> abre la cámara del dispositivo en un toque y la foto tomada llega **al mismo formulario de captura**
> —sin ruta nueva, sin contrato nuevo y sin cambiar el contenido ni los rótulos del panel—; cancelar la
> cámara no navega y el hueco `Ayuda` no es un enlace.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:136) fila D12;
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:192) §4, notas D8–D11;
> [`plan-ciclo-d8-shell-nav`](plan-ciclo-d8-shell-nav.md:1);
> [`wiki-delta`](../.plans/wiki-delta.md:22) §3 y §4;
> [`workflow-ciclos`](workflow-ciclos.md:1).

## 0. Hecho o decisión que abre el corte

| Pregunta                                                                      | Respuesta                                                                                                                                                                                                                       | Fecha      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ¿Qué mueve D12 si D8 ya dejó la barra con tres destinos?                      | La barra pasa a **cinco posiciones** —`Captura`, `Capturados`, `Foto` al centro, `Ayuda` inerte y `Cuenta`— y el centro es un acto, no un destino: abre la cámara del móvil.                                                    | 2026-11-09 |
| ¿`Foto` es una ruta o un botón?                                               | Un **botón** con un input de cámara oculto en la shell. No hay `/captura/nueva`, ni query param, ni ruta nueva; la URL de destino sigue siendo `/captura`.                                                                      | 2026-11-09 |
| ¿Cómo llega la foto al panel si el panel no cambia?                           | Por un **buzón compartido** en memoria (`PhotoInboxStore`, `providedIn: 'root'`): la shell deposita el `File` y `ItemFormComponent` lo consume al montarse. El formulario y su plantilla no cambian de contenido ni de rótulos. | 2026-11-09 |
| ¿Qué pasa si la cuenta tiene dos o más membresías y no eligió (guarda de D2)? | La foto **se conserva en el buzón** y se entrega al panel cuando el usuario elige su mudanza y `/captura` se monta. Si nunca llega a montarse, se descarta al cerrar la pestaña: el buzón vive solo en memoria.                 | 2026-11-09 |
| ¿Cancelar la cámara navega?                                                   | No. Sin `change` con archivo no hay staging ni navegación; el botón solo dispara el input.                                                                                                                                      | 2026-11-09 |
| ¿`Ayuda` es funcionalidad?                                                    | No. Es un hueco **inerte** que sostiene la simetría y anuncia una ayuda futura: sin enlace, sin foco, sin modal y sin `aria-current`.                                                                                           | 2026-11-09 |
| ¿Se renombra `Captura` a `Asistente IA`?                                      | No. Descartado por el dueño: `Captura` sigue siendo el destino y el enlace al panel.                                                                                                                                            | 2026-11-09 |

## 1. Hipótesis y corte

- **Qué compra:** la barra inferior privada publica cinco posiciones en el orden `Captura`,
  `Capturados`, `Foto`, `Ayuda`, `Cuenta`. `Captura`, `Capturados` y `Cuenta` conservan su enlace y su
  `aria-current` exactamente como en D8. `Foto` es un botón redondo y centrado que abre la cámara del
  dispositivo desde cualquier pantalla privada; al elegir un archivo se deposita en el buzón, se
  navega a `/captura` y el formulario existente lo recibe y procesa **igual que una foto elegida en
  él** —optimización en el dispositivo, vista previa, ticket y errores idénticos—, sin borrar lo que
  el usuario ya escribió y sin que el panel gane un rótulo ni un campo nuevo. `Ayuda` es un hueco
  inerte.
- **Qué no compra:** no cambia la ruta, la guarda, el contrato ni el backend; no toca
  `shared`, `shop` ni `backend`; no introduce captura múltiple (A1), estado por foto (A2) ni galería
  (A3); no renombra `Captura`; no hace funcional `Ayuda`; no persiste la foto en disco.
- **Costo declarado:** una superficie (`frontend`) —shell, un store nuevo y el formulario de captura,
  más sus pruebas unitarias—, el arnés `e2e/` y el delta del tile `A0` del wiki. **Sin migración y sin
  dependencias nuevas.**

## 2. Fuera de este corte

- Renombrar `Captura` a `Asistente IA` (descartado por el dueño el 2026-11-09).
- Cualquier comportamiento de `Ayuda`: ruta, modal, tooltip, texto de ayuda, `aria-disabled` con
  acción, o un `href="#"`.
- Ruta nueva, ruta hija, query param o `state` para transportar la foto: el buzón es memoria del
  proceso, no URL.
- Cambios en el contenido, los rótulos, los `data-testid`, los estados de error o el orden del panel
  de captura ([`capture.component.html`](../frontend/src/app/events/capture.component.html:1)).
- El input de archivo que ya vive dentro del formulario: se conserva tal cual y sigue funcionando.
- Captura múltiple (A1), estado `local`/`uploaded` por foto (A2), galería pública (A3), HEIC (D6).
- Cambios en la guarda `requireEventChoice` o en la elección de mudanza (D2).
- Persistir el buzón en `localStorage` o IndexedDB: la foto vive en memoria y muere con la pestaña
  (X8 ya descartó credenciales en IndexedDB).
- Cambios en `backend`, `shared`, `shop` y en el mapa de rutas de `wiki`.

## 3. Datos

Sin migración. Ninguna tabla ni columna cambia; ninguna escritura nueva.

## 4. Contrato

Sin contrato nuevo ni modificado. La foto tomada desde la barra recorre **las mismas** llamadas que
una foto elegida en el panel: `POST /events/:eventId/captures` (ticket con las tres URL prefirmadas),
las escrituras directas al almacén, `POST /events/:eventId/items/:itemId/photos` (adjunción) y, si el
humano lo pide, `POST /events/:eventId/ai/drafts`. Nada de eso cambia.

## 5. Superficies y UI

### 5.1 La barra de cinco posiciones

| Posición | Control                             | `data-testid`        | Comportamiento                                                       |
| -------- | ----------------------------------- | -------------------- | -------------------------------------------------------------------- |
| 1        | Enlace `Captura` a `/captura`       | `shell-nav-capture`  | Destino; conserva `aria-current="page"` en `/captura`                |
| 2        | Enlace `Capturados` a `/capturados` | `shell-nav-captured` | Destino; activo en `/capturados` y `/articulos/:itemId`              |
| 3        | Botón redondo `Foto`                | `shell-nav-photo`    | Abre la cámara; nunca es destino y nunca lleva `aria-current`        |
| 4        | Hueco inerte con la leyenda `Ayuda` | `shell-nav-help`     | Sin enlace, sin foco, `aria-hidden="true"`                           |
| 5        | Enlace `Cuenta` a `/cuenta`         | `shell-nav-account`  | Destino; activo en `/cuenta`, `/cuenta/*`, `/dashboard` y `/eventos` |

Reglas de forma:

- El `<ul>` de la barra pasa a cinco `<li>` en ese orden; `Foto` no rompe la rejilla ni desplaza a los
  enlaces.
- `Foto` es un `<button type="button">` con nombre accesible `Tomar una foto`, la leyenda visible
  `Foto` y un glifo de cámara decorativo (`aria-hidden`). Es redondo y elevado sobre la barra; la
  barra conserva `padding` inferior de `safe-area` y `main` conserva su `pb-28`.
- `Ayuda` se pinta con el mismo tamaño de texto que las demás leyendas, en tono apagado, dentro de un
  `<li aria-hidden="true">` con un `<span>`: no es interactivo, no recibe foco y un lector de pantalla
  no lo anuncia como destino.
- `sectionOf()` no cambia: sigue devolviendo solo `captura`, `capturados` o `cuenta`.
- La barra sigue dibujándose solo con sesión (`showNavigation = hasSession`), así que `Foto` existe
  exactamente en las pantallas privadas.

### 5.2 El input de cámara de la shell

| Rasgo         | Valor                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Ubicación     | Dentro de la barra de [`app.html`](../frontend/src/app/app.html:24), fuera del `<ul>` |
| `type`        | `file`                                                                                |
| `accept`      | `ITEM_PHOTO_CONTENT_TYPES.join(',')` del contrato compartido, igual que el formulario |
| `capture`     | `environment`                                                                         |
| Visibilidad   | `class="sr-only"`, `tabindex="-1"`, `aria-hidden="true"`                              |
| `data-testid` | `shell-photo-input`                                                                   |
| `change`      | `onCameraFile($event)`                                                                |

Comportamiento del botón:

1. `Tomar una foto` limpia `input.value` y llama `input.click()`: sin archivo no hay `change`.
2. `onCameraFile` lee el primer archivo; sin archivo **no hace nada** (cancelar no navega).
3. Con archivo: `PhotoInboxStore.stage(file)`, limpia `input.value` y navega a `/captura`.
4. Si ya se está en `/captura`, la navegación no cambia la URL y el formulario vivo consume el buzón
   por su efecto; si la guarda de D2 desvía a `/eventos`, el archivo **permanece** en el buzón hasta
   que el panel se monte.
5. La shell limpia el buzón cuando la sesión termina, para que una foto no sobreviva a un cambio de
   cuenta.

### 5.3 El buzón compartido

`frontend/src/app/events/photo-inbox.store.ts`, `@Injectable({ providedIn: 'root' })`:

| Miembro       | Forma          | Regla                                                                |
| ------------- | -------------- | -------------------------------------------------------------------- |
| `stage(file)` | `void`         | Guarda el archivo más reciente; una foto nueva reemplaza la anterior |
| `take()`      | `File \| null` | Devuelve y vacía la ranura; es el único consumidor legítimo          |
| `clear()`     | `void`         | Vacía la ranura sin entregarla                                       |

Es una sola ranura en memoria: no se serializa, no se escribe en disco y no se publica como señal
enlazable. No valida tipo ni tamaño: esa regla ya vive en el formulario y dos validaciones divergen.

### 5.4 El panel, intacto

`ItemFormComponent` gana el consumo del buzón y **no** cambia su plantilla:

- `onPhoto(event)` se parte en dos: la lectura del `input` del formulario y un `acceptPhoto(file)` con
  el cuerpo que hoy vive en `onPhoto` ([`item-form.component.ts`](../frontend/src/app/items/item-form.component.ts:224))
  —validación de tipo y tamaño, mensajes idénticos, `discardCapture()` de la anterior, optimización,
  `sizes`, vista previa, aviso del borrador y `ensureTicket()`—.
- Un `effect` lee `PhotoInboxStore.take()` y, si hay archivo, llama `acceptPhoto(file)`.
- La foto del buzón **reemplaza solo la foto**: no borra título, nota, medidas ni peso ya escritos, y
  no reinicia el formulario.
- Los dos inputs de archivo conviven sin ambigüedad: el del panel conserva `item-photo-input`; el de
  la shell usa `shell-photo-input`.

## 6. Cambios por archivo

| Archivo                                                         | Cambio                                                                                                                          | Por qué                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `frontend/src/app/events/photo-inbox.store.ts`                  | Store nuevo: `stage`, `take`, `clear`                                                                                           | La foto cruza de la shell al panel sin tocar el contrato |
| `frontend/src/app/app.ts`                                       | Tipo de la barra con cinco entradas, control `foto` y `ayuda`, input de cámara, `onCameraFile`, navegación y limpieza del buzón | La barra declara la forma del corte                      |
| `frontend/src/app/app.html`                                     | Cinco posiciones, botón redondo `Foto`, hueco inerte `Ayuda` e input oculto                                                     | La plantilla publica las cinco posiciones                |
| `frontend/src/app/app.spec.ts`                                  | Orden y número de posiciones, `Foto` es botón, `Ayuda` inerte, archivo depositado y navegación, cancelar sin navegación         | La hipótesis se afirma por lo que la shell publica       |
| `frontend/src/app/items/item-form.component.ts`                 | `acceptPhoto(file)` extraído de `onPhoto` y efecto que consume el buzón                                                         | El panel procesa la foto igual sin cambiar su contenido  |
| `frontend/src/app/items/item-form.component.spec.ts`            | Foto del buzón optimizada y previsualizada, campos escritos conservados y ranura vacía                                          | La entrega del buzón es la evidencia del corte           |
| `e2e/capture.spec.ts`                                           | Recorrido real: desde otra pantalla privada, `Foto` no navega al cancelar y un archivo abre `/captura` con la foto lista        | La cámara del móvil se prueba donde de verdad existe     |
| `wiki/src/app/app/a0-superficies/a0-superficies.component.html` | Nota de la barra de cinco posiciones y del botón `Foto`                                                                         | Delta del tile dueño de rutas y guardas                  |
| `plans/estructura-ui-navegacion-mudanzapp.md`                   | Nota del corte D12 en §4                                                                                                        | La fuente de forma queda al día                          |
| `.plans/resumen-funcional-app-mudanzapp.md`                     | §3 y §4: el corte y la capacidad `nav-photo`                                                                                    | Promoción del ciclo                                      |
| `plans/backlog-funcionalidades-pendientes.md`                   | Fila D12 con su plan y su estado                                                                                                | Estado consultable                                       |

## 7. Evidencia

- `shell-nav` publica cinco posiciones en el orden `Captura`, `Capturados`, `Foto`, `Ayuda`, `Cuenta`.
- `shell-nav-photo` es un `<button>` sin `href` ni `aria-current`; al pulsarlo se dispara el input
  oculto `shell-photo-input`.
- Un `change` **sin** archivo no navega y deja el buzón vacío; la URL no cambia.
- Un `change` **con** archivo deposita el `File` en el buzón y navega a `/captura`.
- Con la foto en el buzón, `ItemFormComponent` la optimiza, publica `item-photo-preview` y
  `item-photo-sizes`, pide el ticket y deja el buzón vacío; el título escrito antes de tomar la foto
  sigue en `item-title-input`.
- Una foto de tipo no admitido depositada en el buzón produce el mismo mensaje que elegirla en el
  panel (`La foto debe ser JPEG, PNG o WebP.`) y no deja ranura ocupada.
- `shell-nav-help` no tiene `href` ni `tabindex`, publica `aria-hidden="true"` y su texto `Ayuda`.
- La barra no se dibuja sin sesión (prueba existente de [`app.spec.ts`](../frontend/src/app/app.spec.ts:42)).
- e2e: con sesión canjeada, desde `/cuenta` se pulsa `Foto`, se atiende el `filechooser` sin archivo y
  la URL sigue siendo `/cuenta`; después se fija un PNG en `shell-photo-input` y la app aterriza en
  `/captura` con `item-photo-preview` visible y `shell-nav-capture` en `aria-current="page"`.
- Gate proporcional de [`workflow-ciclos`](workflow-ciclos.md:154) con `frontend/`, `e2e/` y `wiki/`
  tocados: `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run test:web:frontend`, `npm run build:web:frontend`, `npm run test:web:wiki`,
  `npm run build:web:wiki` y `npm run typecheck:e2e`; más `npm run db:migrate:test` a mano y
  `npm run test:e2e` para el arnés.

## 8. Orden de implementación

1. Promoción de D12 en `resumen-funcional` §3 y §4; fila del backlog con su plan.
2. `PhotoInboxStore` con sus tres miembros y su unit.
3. `ItemFormComponent`: `acceptPhoto(file)` extraído sin cambiar mensajes ni orden, y el efecto que
   consume el buzón; unit del formulario.
4. `App`: cinco entradas, botón `Foto`, hueco `Ayuda`, input oculto y `onCameraFile`; unit de la shell.
5. Plantilla de la shell con las cinco posiciones, el botón redondo y el hueco inerte.
6. Arnés `e2e/`: cancelar sin navegar y archivo que abre el panel con la foto.
7. Nota de `estructura-ui` §4 y delta del tile `A0`.
8. Gate proporcional y `npm run ciclo:check`.

## 9. Rama, base y entrega

- Sin migración propia: solo el `db:migrate:test` que el arnés exige a mano antes de `test:e2e`.
- Sin rama de código por ciclo: el corte sigue la regla de la dev branch única.
- Si la revisión contradice la hipótesis —el panel cambia de contenido, la foto no llega, cancelar
  navega o `Ayuda` se vuelve interactiva— el corte se detiene y la alternativa vuelve al dueño antes
  de seguir.

## 10. Correcciones de fuente que el corte exige

- `.plans/resumen-funcional-app-mudanzapp.md` §3 y §4: la fila del corte y la capacidad `nav-photo`.
- `plans/backlog-funcionalidades-pendientes.md` fila D12: `planeada plans/plan-ciclo-d12-nav-foto.md`
  y, al cerrar, `cerrada <sha> <fecha>` con el `Última revisión` del encabezado al día.
- `plans/estructura-ui-navegacion-mudanzapp.md` §4: nota del corte D12 —cinco posiciones, `Foto`
  como acto y `Ayuda` inerte—.
- `wiki/src/app/app/a0-superficies/a0-superficies.component.html`: la barra privada tiene cinco
  posiciones y el centro abre la cámara. La cabecera de frescura se mueve al commit del corte.

## 11. Riesgos y disparadores

| Riesgo                                                                 | Qué lo dispara                                                      | Qué se hará                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| La guarda de D2 desvía a `/eventos` y la foto queda esperando          | Una cuenta con dos membresías pulsa `Foto` antes de elegir          | Decisión del 2026-11-09: el buzón la conserva y el panel la recibe al montarse; se prueba |
| Navegar a `/captura` estando ya en `/captura` no remonta el formulario | La foto no aparece al pulsar `Foto` en el propio panel              | El efecto del formulario consume el buzón aunque la navegación sea un no-op               |
| Dos toques rápidos producen dos capturas                               | La revisión ve la segunda foto reemplazando a la primera            | Una sola ranura: la última gana y la anterior se descarta como hoy al elegir otra foto    |
| La foto se pierde al recargar                                          | La revisión recarga con una foto en el buzón                        | Es el costo declarado: el buzón es memoria; persistirlo es X8                             |
| Un navegador no decodifica lo que entrega la cámara (HEIC)             | Un archivo HEIC real desde un iPhone                                | El mensaje existente del formulario sigue siendo la respuesta; la detección es D6         |
| El hueco `Ayuda` se anuncia como destino o recibe foco                 | Un lector de pantalla lo lista en la navegación                     | `aria-hidden="true"`, sin `href` ni `tabindex`; el unit lo afirma                         |
| La barra más alta tapa el final del formulario                         | La revisión no alcanza los botones de publicación con la barra fija | Se conserva el `pb-28` de `main` y se ajusta el alto de la barra si hace falta            |
| El input de la shell compite con el del panel                          | El arnés fija archivos en el input equivocado                       | Dos `data-testid` distintos: `shell-photo-input` y `item-photo-input`                     |

## 12. Alternativas evaluadas

- **Un input de cámara por pantalla:** repite el control en `/capturados`, `/cuenta` y `/eventos`, y
  cada pantalla tendría que saber navegar y entregar la foto. Descartada.
- **Navegar primero y abrir la cámara después:** el orden se invierte y cancelar ya habría navegado,
  contra la decisión del dueño. Descartada.
- **Transportar la foto por la URL o por `router.navigate` con `state`:** un `File` no cabe en una
  URL y el `state` del router no es un buzón; además rompe la recarga sin ganar nada. Descartada.
- **`ui-camera-button` reutilizable en `ui/`:** sin segundo consumidor no compra aprendizaje y añade
  API pública que después hay que sostener. Descartada hasta que exista otro uso.
- **Un botón flotante sobre la barra en vez de una posición:** no cumple «cinco posiciones» y duplica
  visualmente el destino `Captura`. Descartada.
- **Que el buzón también alimente la edición de un artículo (`/articulos/:itemId`):** hoy la edición
  no cambia la foto; ampliarlo es alcance nuevo. Descartada.

## 13. Cierre

Implementado y validado en local el 2026-11-09, en el commit `b7e67aa`. Gate ejecutado, un comando por
invocación:
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:web:frontend` (30 archivos,
205 pruebas), `npm run build:web:frontend` (inicial de 739.60 kB, con el aviso de presupuesto conocido
de D5), `npm run test:web:wiki` (13 pruebas), `npm run build:web:wiki`, `npm run typecheck:e2e`,
`npm run db:migrate:test` a mano antes del arnés y `npm run test:e2e` (24 pasaron, 42 omitidas por
proyecto; la prueba nueva del botón `Foto` pasó en 881 ms).

Lo que se observó: la barra publica las cinco posiciones en orden; `Foto` es un botón, abre el input de
cámara con el `accept` del contrato y no lleva `aria-current`; `Ayuda` es un hueco sin enlace ni foco;
cancelar la cámara no navega ni deja foto en el buzón; un archivo depositado navega a `/captura` y el
formulario lo optimiza, publica `item-photo-preview` y conserva el título escrito; una foto de tipo no
admitido produce el mismo mensaje del panel. `npm run ciclo:check` cerró en `ok` con los avisos
preexistentes.

Pendiente con su disparador: la revisión `live` en remoto del dueño, y el contenido del hueco `Ayuda`
solo si el dueño abre su propio ciclo —hoy es inerte por decisión del 2026-11-09—.
