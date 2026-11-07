# Plan del ciclo B10 — `seller-request-record`: el vendedor relee cada solicitud como un registro

> **Estado:** **plan ejecutable, aprobado por el dueño y ejecutado en este ciclo.** Ninguna migración,
> ninguna dependencia nueva y ninguna escritura nueva.
> **Hipótesis:** el vendedor expande cada solicitud de su panel y lee el registro —los artículos que se
> pidieron con su precio de la instantánea, el estado de cada uno frente al catálogo de hoy y su
> importe vigente—, con la nota de precio visible en el resumen, sin que la solicitud, su importe
> congelado, lo que ve el comprador ni el mensaje de WhatsApp cambien.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:96) fila B10;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1079) §44;
> [`plan-ciclo-b8`](plan-ciclo-b8-request-staleness.md:1) §4 y §6;
> [`plan-ciclo-b9`](plan-ciclo-b9-registro-solicitud-comprador.md:1) §4, §5 y §11;
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:233) §4.

## 0. Hecho que abre el corte

| Pregunta                                                                           | Respuesta del dueño (2026-11-07)                                                                                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ¿Qué relee el vendedor?                                                            | Cada solicitud como un **registro**, no como una línea con referencia, nombre y conteo.                                           |
| ¿Qué debe leer por artículo?                                                       | El título y el **precio de la instantánea** —lo que se pidió—, el **estado** de hoy y su **importe vigente**.                     |
| ¿Cómo se muestra?                                                                  | Un card colapsable `Registro de Artículos solicitados` que se expande; la nota de precio se lee en el resumen, antes de expandir. |
| ¿Qué aporta un artículo despublicado, vendido o eliminado al importe vigente?      | **Cero.**                                                                                                                         |
| ¿Qué importe aporta un artículo con precio cambiado?                               | El **precio de hoy**; la instantánea se conserva como el precio que se pidió.                                                     |
| ¿Cambia la solicitud, su importe congelado, el comprador o el mensaje de WhatsApp? | **No.** El importe congelado del panel sigue publicado como hoy y el comprador no ve nada distinto.                               |

## 1. Hipótesis y corte

- **Qué compra:** el renglón de `Solicitudes` de `/cuenta/evento` envuelve su contenido en un
  `<details>` con la leyenda `Registro de Artículos solicitados`; el resumen publica el número de
  artículos, el **importe vigente** y, cuando algún renglón está en `price_changed`, la nota
  `Atención, al menos uno de los artículos cambió de precio.`; el detalle publica un renglón por
  artículo con el título, el precio de la instantánea, el importe vigente y la pastilla de estado.
- **Qué no compra:** no cambia la solicitud, no reescribe la instantánea, no publica un importe nuevo
  desde el borde, no añade historial ni notas del vendedor, no toca el carrito, el comprador ni el
  mensaje de WhatsApp.
- **Costo declarado:** `frontend` (la pantalla del panel y sus pruebas) y `e2e` (la ruta crítica). El
  contrato de `shared` ya existe desde B8/B9. **Sin migración**, **sin dependencias nuevas**, **sin
  escritura nueva** y **sin una segunda derivación**: el importe vigente sale de
  `cartRequestItemAmount`/`cartRequestAvailableTotal` y el aviso de `cartRequestHasChanges`.

## 2. Fuera de este corte

- La solicitud, su instantánea y su importe congelado: el panel sigue leyendo `totalCents` como hoy
  (B1). El importe vigente es un hecho **distinto** y vive dentro del registro.
- El comprador y `/carrito/:publicSlug`: B9 ya publicó su card; este corte no lo toca.
- Notas del vendedor, respuestas, historial de solicitudes cerradas y aviso en tiempo real (B6).
- Paginar la lista de solicitudes (D1).
- `shared`, `backend` y `shop` en su **código**: el contrato ya publica `items`, `state`,
  `currentPriceCents` y `hasChanges`, y el importe vigente se deriva con las funciones de B9.
- El importe de la venta (B7) y la exclusividad por artículo (B3).

## 3. Datos

Ninguno. El corte lee lo que B8 ya deriva y no escribe nada:

- `CartRequestSummary.items` — `title`, `priceCents` (instantánea), `state` y `currentPriceCents`.
- `CartRequestSummary.hasChanges` — la agregación que el borde ya publica.

No hay columna, tabla ni migración: el estado y el importe vigente son derivaciones de lectura.

## 4. Contrato

Sin cambios. El panel ya recibe:

```text
GET /events/:eventId/cart-requests
200 {
  requests: [{
    id, reference, buyerName, itemCount,
    items: [{ title, priceCents, state, currentPriceCents }],
    hasChanges, totalCents, requestedAt, dismissedAt, cancelledAt
  }]
}
```

Reglas que la pantalla respeta:

- `totalCents` sigue siendo el **importe congelado**; el registro muestra aparte el **importe vigente**
  derivado con `cartRequestAvailableTotal`.
- El importe de cada renglón es `cartRequestItemAmount`: `0` para `unpublished`, `sold` y `deleted`, y
  el precio de hoy para `price_changed` (`0` si el vendedor lo vació).
- El aviso de cambios vigente (B8) se conserva; la nota de precio se enciende solo con un
  `price_changed`, no con cualquier cambio, y es texto además de color.
- `hasChanges` se agrega con `cartRequestHasChanges` sobre estados conocidos; un borde anterior a B8 no
  publica `state` y el panel **no** pinta el registro ni un aviso falso: degrada al renglón de 4e.
- Sin códigos de error nuevos.

## 5. Superficies y UI

`frontend` — `/cuenta/evento`, pestaña `Solicitudes`:

- El renglón de la solicitud conserva su referencia, el detalle (nombre, conteo y fecha), el importe
  congelado, la pastilla del estado de la solicitud y `Descartar`.
- Dentro del renglón, un `<details>` nativo y accesible con teclado (`<summary>`):
  - **Resumen (colapsado):** la leyenda `Registro de Artículos solicitados`, el número de artículos,
    `Importe vigente $X` y, solo con `price_changed`, la nota
    `Atención, al menos uno de los artículos cambió de precio.`
  - **Detalle (expandido):** una lista con un renglón por artículo —título, `Pidió: $X` de la
    instantánea, `Importe vigente: $Y` y la pastilla del estado—, más la explicación de que los no
    disponibles no suman y que un precio cambiado suma el de hoy.
- Pastillas: `Vigente`, `Despublicado`, `Vendido`, `Eliminado` y `Precio cambiado`. El texto nombra el
  estado; el color solo acompaña.
- Un artículo con `price_changed` y el precio vacío muestra `Sin precio actualmente` bajo el renglón.
- Estado vacío y lista sin cambios: la sección se lee como hoy; sin estados conocidos no hay card.
- `data-testid` nuevos: `dashboard-request-record`, `dashboard-request-record-total`,
  `dashboard-request-record-price-notice`, `dashboard-request-record-items`,
  `dashboard-request-record-item`, `dashboard-request-record-item-snapshot`,
  `dashboard-request-record-item-amount` y `dashboard-request-record-item-state-<state>`. Los vigentes
  se conservan.

## 6. Cambios por archivo

| Archivo                                                               | Cambio                                                                                                                                                                                                                                         | Por qué                                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `frontend/src/app/events/dashboard/dashboard.component.ts`            | `requestRecordItems`, `requestAvailableTotalLabel`, `requestItemAmountLabel`, `requestItemSnapshotLabel`, `requestItemStateLabel` (corta), `requestItemStateClasses`, `requestHasPriceChange`; `requestHasChanges` usa `cartRequestHasChanges` | La pantalla no deriva la regla ni pinta importes para un borde viejo |
| `frontend/src/app/events/dashboard/dashboard.component.html`          | El card colapsable con la leyenda, la nota de precio, los renglones y las pastillas dentro del renglón de la solicitud                                                                                                                         | Es el hecho visible del corte                                        |
| `frontend/src/app/events/dashboard/dashboard.component.spec.ts`       | Resumen colapsado, expansión, pastillas, no disponibles en cero, precio cambiado con la nota y degradación sin `state`                                                                                                                         | La pantalla cubre las dos ramas                                      |
| `e2e/cart-request.spec.ts`                                            | Tras despublicar, el vendedor expande el registro y lee `Despublicado` con importe vigente en cero                                                                                                                                             | La ruta crítica demuestra el hecho punta a punta                     |
| `wiki/src/app/app/a1-administracion/a1-administracion.component.html` | El claim de `Solicitudes de carrito` publica el registro y su importe vigente                                                                                                                                                                  | Delta del tile dueño                                                 |
| `.plans/resumen-funcional-app-mudanzapp.md`                           | §3 fila B10 y §4 capacidad `seller-request-record`                                                                                                                                                                                             | Promoción del corte                                                  |
| `.plans/decisiones-tecnicas-app-mudanzapp.md`                         | §44, actualización del corte B10                                                                                                                                                                                                               | La decisión queda escrita                                            |
| `plans/estructura-ui-navegacion-mudanzapp.md`                         | Nota del corte B10 en §4                                                                                                                                                                                                                       | La estructura del panel cambia                                       |
| `plans/backlog-funcionalidades-pendientes.md`                         | Fila B10 con su estado, y el `Última revisión` del encabezado                                                                                                                                                                                  | Estado consultable                                                   |

## 7. Evidencia

- `dashboard.component.spec.ts` — la solicitud nace con el registro **colapsado** y su resumen publica
  la leyenda, el número de artículos y el importe vigente; expandirlo revela un renglón por artículo
  con `Pidió: $X`, su importe vigente y la pastilla `Vigente`; un artículo despublicado, vendido o
  eliminado muestra `$0.00 MXN` y el importe vigente del resumen no los suma; un `price_changed` suma
  el precio de hoy, conserva la instantánea como `Pidió` y la nota
  `Atención, al menos uno de los artículos cambió de precio.` aparece en el resumen sin depender del
  color; un payload sin `state` no pinta el registro ni `NaN`; el importe congelado sigue en su propio
  renglón.
- `e2e/cart-request.spec.ts` — el vendedor abre `Solicitudes`, expande `Registro de Artículos
solicitados`, lee `Despublicado`, `Pidió: $1,250.00 MXN`, importe vigente `$0.00 MXN` y el aviso de
  B8; descarta y vuelve a leer el estado de la solicitud.
- Gate: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:web:frontend`,
  `npm run build:web:frontend` (compila `shared` antes), `npm run typecheck:e2e` y
  `npm run test:e2e:branch` por la ruta crítica. Sin `backend`, sin base y sin migración.

## 8. Orden de implementación

1. Métodos de la pantalla y su plantilla.
2. Pruebas del panel.
3. Arnés e2e.
4. Delta del wiki, correcciones de fuente y gate.

## 9. Rama, base y entrega

El corte **no toca esquema**: no hay `db:migrate:*` que aplicar ni número de migración que reservar. Vive
en el árbol de trabajo y se cierra con su commit convencional.

## 10. Correcciones de fuente que el corte exige

- `resumen-funcional` §3 y §4 — promoción de B10 (`seller-request-record`) **con este plan**.
- `decisiones` §44 — actualización de B10: el vendedor relee cada solicitud como registro, con el
  importe vigente y la nota de precio; el importe congelado no cambia.
- `estructura-ui` §4 — el renglón de `Solicitudes` gana el card `Registro de Artículos solicitados`.
- `wiki` tile A1 — el claim de solicitudes publica el registro del vendedor y su importe vigente.
- `backlog` — fila B10 con su estado y su fecha de revisión.

## 11. Riesgos y disparadores

| Riesgo                                                             | Qué lo dispara                                  | Qué se hará                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dos importes que se leen como uno                                  | el vendedor compara el congelado con el vigente | el renglón dice `Total` (congelado) y el registro `Importe vigente`                |
| El importe vigente se lee como una re-cotización                   | un `price_changed` con precio nuevo             | el renglón muestra `Pidió: $X` y su importe vigente; la nota lo avisa sin expandir |
| Un `state` desconocido pinta importes en cero                      | borde anterior a B8 sirviendo la pantalla nueva | sin estados conocidos no se pinta el registro; queda el renglón de 4e              |
| La derivación se duplica en la pantalla                            | una suma escrita a mano en el template          | el importe sale de `cartRequestItemAmount`/`cartRequestAvailableTotal`             |
| El vendedor confunde «carrito vacío» con «solicitud sin renglones» | una solicitud anterior a B8                     | el registro solo aparece con estados conocidos y la solicitud sigue legible        |

## 12. Alternativas evaluadas

- **A. Publicar un importe vigente nuevo desde el borde.** Duplica un hecho que B9 ya deriva con
  funciones puras compartidas y exige contrato nuevo. Se descarta.
- **B. Sustituir el importe congelado por el vigente en el renglón.** Borra el hecho de B1 y rompe la
  lectura del panel. Se descarta: son dos hechos con dos nombres.
- **C. Reutilizar el card de `shop` como componente compartido.** Monta en `frontend` una pieza de la
  tienda, con sus textos y su sesión. Se descarta: dos lectores, dos pantallas, la misma derivación.
- **D. Pintar el registro solo cuando `hasChanges` es verdadero.** Un registro que desaparece al
  estabilizarse el catálogo no es un registro. Se descarta: el card vive siempre que haya estados
  conocidos y el aviso es lo condicional.

## 13. Cierre

- **Evidencia observada (2026-11-07).**
  - `dashboard.component.spec.ts` — el registro nace colapsado; el resumen publica la leyenda, el
    conteo y el importe vigente; al expandir, cada renglón muestra `Pidió: $X`, su importe vigente y la
    pastilla; los no disponibles quedan en `$0.00 MXN`; `price_changed` suma el precio de hoy y la nota
    se lee sin expandir; sin `state` no hay registro ni `NaN`; el importe congelado se conserva.
  - `e2e/cart-request.spec.ts` — el paso 5 expande `Registro de Artículos solicitados` y lee
    `Despublicado`, `Pidió: $1,250.00 MXN`, importe vigente `$0.00 MXN` y el total del registro.
  - **Falso rojo del arnés, diagnosticado:** una primera corrida de `test:e2e:branch` falló al abrir
    `/cuenta/evento` también en `event-admin.spec.ts`, que este corte no toca, con
    `GET /events/:id/dashboard` en `200` y el chunk perezoso del panel sin pedirse. La causa era la
    caché de build de `ng serve` (`frontend/.angular/cache`): tras `npx ng cache clean` el mismo
    arnés pasó. Se registra en `plans/inbox.md` #9 como deuda del arnés, no del corte.
  - Gate en verde: `typecheck`, `lint`, `format:check`, `test:web:frontend` (194), `build:web:frontend`,
    `test:web:wiki` (13), `build:web:wiki`, `typecheck:e2e` y `test:e2e:branch` (23 passed, 40 skipped),
    con `db:migrate:branch:test` aplicado a mano antes de la suite.
- **Wiki:** delta del tile A1 —el panel publica el registro del vendedor con el importe vigente y la
  nota de precio—; el tile A3 ya publica el registro del comprador y no se reescribe.
- **Commit del ciclo:** `ba2ab6c` (el cierre del estado quedó en un commit `docs` posterior).
