# Plan del ciclo B8 — `request-staleness`: la solicitud conserva su instantánea y el panel marca lo que ya cambió

> **Estado:** **plan ejecutable, sin ejecutar.** Ninguna migración, ninguna dependencia nueva y ningún
> commit.
> **Hipótesis:** El vendedor distingue, en cada solicitud, qué artículos de la instantánea ya no
> coinciden con el catálogo actual —despublicado, vendido, eliminado o precio cambiado— sin reescribir la
> solicitud ni añadir estado.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:88) fila B8;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1058) §44;
> [`plan-ciclo-4e`](plan-ciclo-4e-carrito-seleccionados-whatsapp.md:435) §11;
> [`modelo-datos`](../.plans/modelo-datos-app-mudanzapp.md:64) §1.

## 0. Hecho que abre el corte

| Pregunta                                                                                                                                                                      | Respuesta del dueño (2026-11-07)                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| El vendedor despublica un artículo que estaba en un carrito. El comprador recibe el aviso del carrito, pero la solicitud del panel todavía lo lista. ¿Se cambia la solicitud? | **No.** La solicitud sigue siendo una instantánea; el dueño acepta ese hecho.                                       |
| ¿Qué debe ver el vendedor?                                                                                                                                                    | Un letrero que recuerde que la solicitud ya no refleja lo actual, con el estado actual de cada artículo que cambió. |
| ¿Se guarda el cambio en la solicitud?                                                                                                                                         | **No.** El estado se deriva al leer; la instantánea no se reescribe.                                                |
| ¿Se toca al comprador o el mensaje de WhatsApp?                                                                                                                               | **No** en este corte. El carrito ya retira el artículo despublicado y lo explica.                                   |

## 1. Hipótesis y corte

- **Qué compra:** la solicitud conserva título y precio del momento de pedir, y el panel del vendedor
  marca cada artículo cuyo estado actual difiere de esa instantánea: `unpublished`, `sold`, `deleted` o
  `price_changed`. La solicitud publica `hasChanges` y el panel muestra el recordatorio de que es una
  foto del pasado.
- **Qué no compra:** no cambia el carrito, no cambia la solicitud guardada, no cancela ni retira nada,
  no avisa al comprador por WhatsApp, no reabre la venta y no añade un acto de «revalidar».
- **Costo declarado:** `shared` (tipos de la solicitud), `backend` (la consulta del panel y su presenter)
  y `frontend` (el renglón de la solicitud). **Sin migración** y **sin dependencias nuevas**.

## 2. Fuera de este corte

- El cuadro de la solicitud abierta en `shop`: el comprador ya recibe el aviso del carrito cuando el
  artículo se despublica y la solicitud abierta solo publica su referencia y su enlace.
- Cambiar el mensaje de WhatsApp; sigue llevando **solo** la referencia.
- Borrar, cancelar o descartar la solicitud automáticamente cuando un artículo cambia.
- Reescribir la instantánea, añadir una tabla de historial o guardar el estado actual.
- Revalidar o re-cotizar desde el panel (un acto nuevo, si el dueño lo pide).
- Monedas con otros decimales (F7), monto de la venta (B7), carrito entre dispositivos (B2) y
  exclusividad (B3).
- Cambiar la foto, el título o la URL del artículo: no son parte de la decisión de compra.

## 3. Datos

Ninguno. El corte usa hechos que ya existen:

- `app.cart_request_item.listing_id` — sobrevive a la despublicación y a la venta; queda `NULL` cuando
  el artículo se borra (`ON DELETE SET NULL`).
- `app.cart_request_item.title_snapshot` y `price_cents_snapshot` — la instantánea que no se toca.
- `app.listing.unpublished_at` y `app.listing.sold_at` — el estado de publicación y de venta.
- `app.item.price_cents` — el precio actual, comparado con la instantánea.

No hay columna, tabla ni migración: el estado es una derivación de lectura.

## 4. Contrato

```text
GET /events/:eventId/cart-requests
200 {
  requests: [{
    id, reference, buyerName, itemCount, totalCents, requestedAt, dismissedAt, cancelledAt,
    hasChanges: boolean,
    items: [{
      title: string,
      priceCents: number,
      state: 'current' | 'unpublished' | 'sold' | 'deleted' | 'price_changed',
      currentPriceCents: number | null
    }]
  }]
}
403 forbidden
```

Reglas:

- `state` se deriva en la lectura, con este orden:
  1. `deleted` — `listing_id IS NULL` (el artículo o su fila de publicación ya no existe).
  2. `unpublished` — `app.listing.unpublished_at IS NOT NULL`.
  3. `sold` — `app.listing.sold_at IS NOT NULL`.
  4. `price_changed` — `app.item.price_cents IS DISTINCT FROM price_cents_snapshot`.
  5. `current` — todo lo demás.
- Republicar limpia `unpublished_at` (`listings-store` ya lo hace) y el estado vuelve a ser `current`.
- `currentPriceCents` es el precio actual del artículo; `null` cuando el artículo ya no existe o el
  vendedor vació el precio. La pantalla lo usa solo en `price_changed`.
- `hasChanges` es `items.some(item => item.state !== 'current')`, derivado en el presenter; no viaja en
  el SQL como una segunda regla.
- La instantánea (`title`, `priceCents`) no cambia. El total congelado de B1 tampoco.
- No hay códigos de error nuevos ni cambios en las rutas del carrito o del comprador.

## 5. Superficies y UI

- `frontend` — `/cuenta/evento`, pestaña `Solicitudes`: cada renglón conserva la instantánea y su total.
  Si `hasChanges`, añade:
  - un aviso: «Esta solicitud conserva lo que se pidió. Los artículos marcados ya no coinciden con el
    catálogo actual.»;
  - una lista de los artículos cambiados, con su causa: «Despublicado después de la solicitud»,
    «Vendido después de la solicitud», «Eliminado después de la solicitud» o «Precio actual:
    $X MXN» (o «Sin precio actualmente»).
- El estado de la solicitud (`pendiente`, `atendida`, `cancelada`) y `Descartar` no cambian.
- No hay estado vacío nuevo: sin cambios, el renglón se lee como hoy.
- Accesibilidad: el aviso es texto, no depende solo del color; la lista de cambios es una `<ul>` y el
  nombre del artículo va en el texto de cada `<li>`.
- Compatibilidad de despliegue: un borde anterior a B8 no publica `state` ni `hasChanges`. El panel no
  debe tratar `undefined` como un cambio: solo muestra el aviso si `hasChanges === true` (o si deriva
  un `state` conocido distinto de `current`), y no pinta etiquetas para `undefined`.

## 6. Cambios por archivo

| Archivo                                                         | Cambio                                                                                                                       | Por qué                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `shared/src/cart.ts`                                            | `CartRequestItemState`; `CartRequestItem.state` y `currentPriceCents`; `CartRequestSummary.hasChanges`                       | Una forma única para el estado derivado                      |
| `shared/src/index.ts`                                           | Exporta `CartRequestItemState` junto a los tipos de la solicitud                                                             | El panel y las pruebas no redefinen la unión                 |
| `backend/src/store/cart-store.ts`                               | En el `LATERAL` de `listCartRequestsForEvent`, `LEFT JOIN app.listing` y `app.item`; `CASE` del estado y `currentPriceCents` | La lectura publica el estado actual sin tocar la instantánea |
| `backend/src/routes/presenters.ts`                              | `toCartRequestSummary` mapea `state`/`currentPriceCents` y calcula `hasChanges`                                              | El presenter aplica la regla de agregación                   |
| `backend/test/support/cart-fixture.ts`                          | La solicitud guarda `listingId` por artículo y el doble deriva el estado con sus listings                                    | La frontera se prueba sin base                               |
| `backend/test/routes/cart.test.ts`                              | Casos `current`, `unpublished`, `sold`, `deleted` y `price_changed`, y `hasChanges`                                          | El contrato no puede perder un estado en silencio            |
| `backend/test/db/cart.test.ts`                                  | La base real ejercita la consulta y el `CASE`; se actualiza la aserción de la instantánea borrada a `state: 'deleted'`       | Solo la base demuestra los `LEFT JOIN` y `IS DISTINCT FROM`  |
| `frontend/src/app/events/dashboard/dashboard.component.ts`      | `requestHasChanges`, `changedRequestItems` y `requestItemStateLabel`                                                         | La pantalla no inventa ni pinta `undefined`                  |
| `frontend/src/app/events/dashboard/dashboard.component.html`    | Aviso y lista de artículos cambiados dentro del renglón                                                                      | El vendedor lee el recordatorio y la causa                   |
| `frontend/src/app/events/dashboard/dashboard.component.spec.ts` | Fixtures con los cinco estados; aviso solo con cambios; compatibilidad con un payload sin el campo                           | La pantalla cubre las dos ramas                              |
| `frontend/src/app/events/dashboard/cart-requests.store.spec.ts` | Fixture de la solicitud con `state` y `hasChanges`                                                                           | El store conserva la forma nueva                             |
| `e2e/cart-request.spec.ts`                                      | Tras despublicar, el panel muestra el aviso y la causa del artículo                                                          | La ruta crítica demuestra el hecho punta a punta             |

## 7. Evidencia

- `cart.test.ts` (frontera) — una solicitud con un artículo vigente responde `state: 'current'` y
  `hasChanges: false`; con uno despublicado, `unpublished` y `true`; con uno vendido, `sold`; con
  `listing_id` nulo, `deleted`; con el precio actual distinto, `price_changed` y `currentPriceCents`
  nuevo. El título y el precio de la instantánea no cambian en ningún caso.
- `cart.test.ts` (base) — la misma solicitud pasa por `unpublished`, `sold`, `price_changed` y
  `deleted` sobre Postgres; republicar devuelve `current`; la instantánea sobrevive al borrado.
- `dashboard.component.spec.ts` — el aviso aparece solo con `hasChanges`; cada estado pinta su frase;
  un payload sin `state`/`hasChanges` no muestra el aviso ni un `NaN`.
- `e2e/cart-request.spec.ts` — el vendedor despublica después de la solicitud, el comprador ve el aviso
  del carrito y el panel del vendedor muestra el aviso de instantánea y el artículo despublicado.
- Gate: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:api`,
  `npm run test:api:db:branch` (la consulta SQL se toca; no hay migración nueva),
  `npm run test:web:frontend`, `npm run build`, `npm run build:web:frontend`,
  `npm run typecheck:e2e` y `npm run test:e2e:branch`.

## 8. Orden de implementación

1. Tipos de `shared` y sus consumidores.
2. Consulta de `listCartRequestsForEvent` y presenter.
3. Pruebas de frontera y de base.
4. Métodos, plantilla y pruebas del panel.
5. Arnés e2e.
6. Correcciones de fuentes, wiki y gate.

## 9. Rama, base y entrega

El corte **no toca esquema**: no hay `db:migrate:*` que aplicar ni número de migración que reservar.
Vive en el árbol de trabajo y se cierra con su commit. La base de dev branch se usa **solo** para
`test:api:db:branch`, que ejercita la consulta real; su esquema ya está aplicado y no cambia.

## 10. Correcciones de fuente que el corte exige

- `decisiones` §44 — añade la actualización de B8: la instantánea no se toca y el panel deriva el estado.
- `estructura-ui` §4 — el renglón de solicitudes incluye el aviso y la lista de artículos cambiados.
- `wiki` tile A1 — la fila de solicitudes marca lo que cambió; A3 enlaza sin reescribir su claim.
- `resumen-funcional` §3 y §4 — promoción de B8 (`request-staleness`).
- `backlog` — fila B8 y conteo del bloque B.

## 11. Riesgos y disparadores

| Riesgo                                      | Qué lo dispara                                         | Qué se hará                                                                              |
| ------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| El vendedor cree que la solicitud cambió    | el aviso no distingue la instantánea del estado actual | el texto dice «conserva lo que se pidió» y la lista es aparte                            |
| Un `state` `undefined` se lee como cambio   | un borde anterior a B8 sirviendo el panel nuevo        | solo se muestra el aviso con un `state` conocido o `hasChanges === true`                 |
| El `CASE` confunde vendido con despublicado | una fila que tuvo ambos                                | el acto de despublicar ya rechaza un vendido; el orden del `CASE` sigue siendo explícito |
| Un precio vaciado se pierde                 | `app.item.price_cents` nulo                            | `IS DISTINCT FROM` lo marca `price_changed` y la etiqueta dice «Sin precio actualmente»  |
| La lista de cambios crece                   | una solicitud con muchos artículos                     | solo se listan los que cambiaron; la instantánea completa sigue en su línea              |
| Un borde viejo y un panel nuevo             | despliegue no atómico                                  | el aviso no aparece y no se pinta `NaN`; el estado vuelve cuando el borde nuevo responde |

## 12. Alternativas evaluadas

- **A. Letrero genérico siempre** — honesto y barato, pero no dice qué cambió. Se conserva como parte
  del aviso, no como única respuesta.
- **B. Solo `hasChanges`** — avisa que algo cambió sin nombrar el artículo. Se descartó frente a C
  porque el dueño pidió el estado por artículo.
- **D. Guardar el estado en la solicitud** — exige migración, escribe en el acto de despublicar y
  duplica `app.listing.unpublished_at`. Se descartó.
- **E. Aviso al comprador** — el carrito ya retira el artículo y lo explica; una segunda nota en la
  solicitud abierta no añade un hecho nuevo en este corte.

## 13. Cierre

- **Evidencia observada (2026-11-07).**
  - `backend/test/routes/cart.test.ts` — `current` con `hasChanges: false`; `unpublished`, `sold`,
    `price_changed` y `deleted` con su causa; el precio de la instantánea no cambia y
    `currentPriceCents` publica el actual (o `null`).
  - `backend/test/db/cart.test.ts` — la consulta real recorre `price_changed`, `current`,
    `unpublished`, republicación, `sold` y `deleted`; la instantánea sobrevive al borrado.
  - `frontend/src/app/events/dashboard/dashboard.component.spec.ts` — aviso solo con cambios, cada
    estado con su frase, y un payload anterior a B8 sin aviso ni `NaN`.
  - `e2e/cart-request.spec.ts` — tras despublicar, el panel muestra el aviso y
    «Despublicado después de la solicitud» junto al artículo.
- **Gate en verde.** `typecheck`, `lint`, `format:check`, `test:api`, `test:api:db:branch`,
  `test:web:frontend`, `build`, `build:web:frontend`, `build:web:wiki`, `test:web:wiki`,
  `typecheck:e2e` y `test:e2e:branch`.
- **Wiki:** delta del tile A1 (fila de solicitudes) y enlace desde A3; sin cambios en el contrato del
  comprador.
- **Commit del ciclo:** `8c22f0d`.
