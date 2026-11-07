# Plan del ciclo B9 — `request-record`: el comprador lee su solicitud abierta con los artículos, su estado y su importe vigente

> **Estado:** **plan ejecutable, sin ejecutar.** Ninguna migración, ninguna dependencia nueva y ningún
> commit.
> **Hipótesis:** El comprador vuelve a su carrito y encuentra su solicitud abierta como un registro
> legible —los artículos que pidió, el estado de cada uno y el importe vigente, con los no disponibles
> en cero— sin que la solicitud se reescriba ni el vendedor vea otra cosa.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:91) fila B9;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1031) §44;
> [`plan-ciclo-b8`](plan-ciclo-b8-request-staleness.md:1) §4 y §6;
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:112) §4.

## 0. Hecho que abre el corte

| Pregunta                                                                                          | Respuesta del dueño (2026-11-07)                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Qué solicitudes ve el comprador?                                                                 | **Solo la abierta.** El modelo admite una sola por comprador y evento; cancelada o descartada, ya no se lista.                                                                      |
| ¿Qué debe leer?                                                                                   | Los artículos que pidió, el estado de cada uno y el total, bajo la leyenda `Registro de Artículos solicitados`.                                                                     |
| ¿Cómo se muestra?                                                                                 | Cards reducidas que se expanden al pulsar, con el detalle dentro; la más nueva arriba.                                                                                              |
| ¿Qué aporta un artículo que ya no está disponible —despublicado, vendido o eliminado— al importe? | **Cero.** El total se muestra, pero lo no disponible no suma.                                                                                                                       |
| ¿Qué importe aporta un artículo que cambió de precio?                                             | El **precio de hoy**; el renglón conserva el de la instantánea como `Antes` y el card avisa `Atención, al menos uno de los artículos cambió de precio.` (corrección del 2026-11-07) |
| ¿Se publican las notas del vendedor, respuestas o un aviso en tiempo real?                        | **No.** Este corte es de lectura.                                                                                                                                                   |

## 1. Hipótesis y corte

- **Qué compra:** `GET`/`PUT /public/events/:publicSlug/cart` publican la solicitud abierta con sus
  renglones —instantánea de B8 más `state` y `currentPriceCents`—, su importe vigente y `hasChanges`; la
  pantalla `/carrito/:publicSlug` lo muestra como un card colapsable con la leyenda
  `Registro de Artículos solicitados` y, cuando algún precio cambió, la nota
  `Atención, al menos uno de los artículos cambió de precio.`
- **Qué no compra:** no cambia el carrito, no reescribe la instantánea, no crea una solicitud, no añade
  historial de solicitudes cerradas, no publica el importe congelado del vendedor de otra manera y no
  toca el mensaje de WhatsApp.
- **Costo declarado:** `shared` (contrato y funciones puras), `backend` (la lectura con la derivación
  compartida y el presenter) y `shop` (la pantalla del carrito y sus pruebas). **Sin migración**,
  **sin dependencias nuevas** y **sin escritura nueva**.

## 2. Fuera de este corte

- Las solicitudes **cerradas** —cancelada por el comprador o descartada por el vendedor— y su historial.
  La lista cronológica inversa se construye con las abiertas; hoy el modelo permite **una**, y el card
  genérico queda listo para el día que el dueño abra el historial.
- Notas del vendedor, respuestas, mensajes o cualquier canal en tiempo real (B6).
- Cambiar el importe congelado que el panel del vendedor lee desde B1: sigue siendo la suma de la
  instantánea.
- Editar, revalidar o re-cotizar la solicitud desde el comprador.
- El carrito entre dispositivos (B2), la exclusividad (B3) y el monto de la venta (B7).
- Un endpoint nuevo: el registro viaja en la lectura del carrito que ya existe.
- `frontend` y `wiki` en su **código**: la pantalla es de `shop`; el wiki recibe su delta documental.

## 3. Datos

Ninguno. El corte usa hechos que B8 ya deriva y no escribe nada:

- `app.cart_request` — `requested_at`, `dismissed_at`, `cancelled_at` para saber cuál es la abierta.
- `app.cart_request_item` — `position`, `title_snapshot`, `price_cents_snapshot` y `listing_id`.
- `app.listing` — `unpublished_at` y `sold_at`.
- `app.item` — `price_cents` actual.

No hay columna, tabla ni migración: el estado y el importe son derivaciones de lectura.

## 4. Contrato

```text
GET /public/events/:publicSlug/cart
200 {
  cart: {
    event, items, unpublished, totalCents, whatsappAvailable,
    request: {
      id, reference, requestedAt, whatsappUrl,
      items: [{ title, priceCents, state, currentPriceCents }],
      totalCents, hasChanges
    } | null
  }
}
401 unauthorized | 404 not_found

PUT /public/events/:publicSlug/cart
200 { cart: <la misma forma>, dropped, unpublished }

POST /public/events/:publicSlug/cart/request
201 { request: <la misma forma que cart.request> }
```

Reglas:

- `request` sigue siendo **la solicitud abierta** (`dismissed_at IS NULL AND cancelled_at IS NULL`) y
  sigue siendo `null` cuando no hay ninguna. Cancelar la deja en `null` en la pantalla, como hoy.
- `request.items` es la instantánea en el orden `position`, con el `state` y el `currentPriceCents` de
  B8. **La regla del estado no se duplica:** las dos lecturas —panel y comprador— comparten el mismo
  fragmento SQL de derivación.
- `request.totalCents` es el **importe vigente**: suma el importe de cada artículo y `0` de los no
  disponibles.
  - `current` aporta su `priceCents` de la instantánea, que es el precio vigente.
  - `price_changed` aporta el `currentPriceCents` de hoy; si el vendedor vació el precio, aporta `0`.
  - `unpublished`, `sold` y `deleted` aportan `0`.
  - Nunca es nulo: es una suma de enteros no negativos.
- El renglón conserva `priceCents` —la instantánea— y publica `currentPriceCents`; la pantalla lee el
  segundo como `Antes`, para que el comprador vea las dos cifras sin que el total las sume dos veces.
- `request.hasChanges` es `items.some(item => item.state !== 'current')`, derivado con la **misma**
  función pura que usa el panel; no viaja como una segunda regla en el SQL.
- El `totalCents` de `CartRequestSummary` (panel, B1) **no cambia**: sigue siendo la instantánea
  congelada. Son dos hechos distintos y cada uno tiene su nombre y su documento.
- `whatsappUrl` sigue siendo el enlace del vendedor compuesto en el borde; el teléfono no se publica
  como campo.
- Sin códigos de error nuevos.
- **Compatibilidad de despliegue:** un borde anterior a B9 no publica `items`, `totalCents` ni
  `hasChanges` dentro de `request`. La pantalla muestra entonces solo la referencia y el enlace —el
  comportamiento de hoy— y nunca pinta `NaN` ni una lista vacía con un total.

## 5. Superficies y UI

`shop` — `/carrito/:publicSlug`:

- El bloque `Solicitud … enviada` de 4e se convierte en **un card colapsable** (`<details>`/`<summary>`,
  nativo y accesible con teclado; sin dependencia nueva):
  - **Resumen (colapsado):** referencia, fecha de la solicitud, número de artículos, importe vigente y
    un distintivo `Con cambios` cuando `hasChanges`.
  - **Detalle (expandido):** la leyenda `Registro de Artículos solicitados`, una lista con un renglón
    por artículo —título, importe y la pastilla de estado—, el total, el enlace `Abrir WhatsApp` y
    `Cancelar solicitud`.
- Reutiliza el formato del carrito: la lista es un `divide-y` con el título en negrita y el importe
  debajo, igual que la selección; la pastilla es un `span` con texto, no solo color.
- Importe por renglón: el vigente del §4 —el de la instantánea cuando no cambió y el **de hoy** cuando
  cambió—, y `$0.00` para los no disponibles. Con `price_changed` el renglón añade `Antes: $X` (o
  `Sin precio actualmente` si el vendedor lo vació) y la pastilla dice `Precio cambiado`.
- **Aviso de precio:** cuando al menos un renglón está en `price_changed`, el card muestra la nota
  `Atención, al menos uno de los artículos cambió de precio.` como texto —no solo color— y se lee en el
  resumen colapsado, antes de expandir. La nota no sustituye la pastilla del renglón.
- Pastillas: `Vigente`, `Despublicado`, `Vendido`, `Eliminado` y `Precio cambiado`.
- Estado vacío: sin solicitud abierta no hay card ni leyenda; la página queda como hoy.
- Un carrito que se vació porque el vendedor despublicó **conserva** el card: la solicitud y su
  registro son independientes de la selección de hoy.
- Accesibilidad: `<summary>` es el control; el texto de cada pastilla nombra el estado; el aviso de
  importe explica en palabras que los no disponibles no suman.
- Los `data-testid` vigentes se conservan (`cart-requested`, `cart-whatsapp`, `cart-request-cancel`) y
  se añaden los del card y sus renglones.

## 6. Cambios por archivo

| Archivo                                         | Cambio                                                                                                                        | Por qué                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `shared/src/cart.ts`                            | `BuyerCartRequest` (extiende `OpenCartRequest`); `PublicCart.request` pasa a esa forma; `IssuedCartRequest.request` también   | Una forma única para la solicitud que el comprador lee         |
| `shared/src/cart.ts`                            | `cartRequestItemAmount`, `cartRequestAvailableTotal` y `cartRequestHasChanges`, puras                                         | El importe y el aviso no se inventan en la plantilla           |
| `shared/src/index.ts`                           | Exporta los tipos y las funciones nuevas                                                                                      | `shop` y las pruebas no redefinen la regla                     |
| `backend/src/store/cart-store.ts`               | Constante con el fragmento `LATERAL` de la instantánea derivada; `findOpenCartRequest` publica `items`; el panel la reutiliza | Una sola derivación para los dos lectores                      |
| `backend/src/routes/presenters.ts`              | `toBuyerCartRequest` compone el registro; `toCartRequestSummary` usa `cartRequestHasChanges`                                  | El presenter aplica la agregación una vez                      |
| `backend/src/routes/cart-router.ts`             | `GET`/`PUT` publican el registro; `POST` lo relee tras insertar                                                               | El acto y la lectura publican la misma forma                   |
| `backend/test/support/cart-fixture.ts`          | El doble responde a la lectura abierta con su instantánea y discrimina la consulta del comprador de la del panel              | La frontera se prueba sin base                                 |
| `backend/test/routes/cart.test.ts`              | Casos de `request.items`, estados, importe vigente, `hasChanges` y el `POST` con la misma forma                               | El contrato no puede perder un estado o un importe en silencio |
| `backend/test/db/cart.test.ts`                  | La base ejercita la lectura abierta a través de `price_changed`, `unpublished`, `sold` y `deleted`                            | Solo la base demuestra los `LEFT JOIN` y el `CASE` compartidos |
| `shop/src/app/cart/shop-cart.store.ts`          | `openRequest` publica la forma nueva y tolera un borde sin `items`                                                            | El card no pinta `NaN` con un despliegue no atómico            |
| `shop/src/app/cart/shop-cart.component.ts`      | `requestRecords`, `requestTotalLabel`, `requestItemAmountLabel`, `requestItemStateLabel` y `hasPriceChange`                   | La pantalla no deriva la regla ni pinta `undefined`            |
| `shop/src/app/cart/shop-cart.component.html`    | El card colapsable con la leyenda, la lista de renglones y las pastillas                                                      | Es el hecho visible del corte                                  |
| `shop/src/app/cart/shop-cart.store.spec.ts`     | Fixture del carrito con el registro y el caso de un borde anterior a B9                                                       | El store conserva la forma nueva y degrada                     |
| `shop/src/app/cart/shop-cart.component.spec.ts` | Resumen colapsado, expansión, pastillas, no disponibles en cero, nota de precio cambiado y payload sin `items`                | La pantalla cubre las dos ramas                                |
| `e2e/cart-request.spec.ts`                      | Tras pedir, el comprador expande el card y lee la leyenda, la pastilla y el total; tras despublicar, el renglón queda en cero | La ruta crítica demuestra el hecho punta a punta               |

## 7. Evidencia

- `cart.test.ts` (frontera) — con la solicitud abierta, `GET` publica `request.items` con
  `state: 'current'`, `totalCents` igual a la suma de la instantánea y `hasChanges: false`; con un
  artículo despublicado, `state: 'unpublished'`, su importe `0` y `hasChanges: true`; con uno vendido y
  con uno eliminado, lo mismo; con `price_changed`, `currentPriceCents` publica el de hoy, el importe del
  renglón y el total usan ese precio y `priceCents` conserva la instantánea; sin solicitud, `request` es
  `null`.
- `cart.test.ts` (frontera) — `POST /cart/request` responde `201` con la misma forma y los artículos
  recién pedidos en `current`.
- `cart.test.ts` (base) — la lectura abierta recorre `price_changed`, `unpublished`, `sold` y `deleted`
  sobre Postgres, y el `CASE` compartido no cambió el resultado del panel.
- `shop-cart.component.spec.ts` — el card nace colapsado y muestra referencia, fecha, número de
  artículos y total; expandirlo revela `Registro de Artículos solicitados`, un renglón por artículo y su
  pastilla; un artículo no disponible muestra `$0.00` y no suma al total; un artículo con `price_changed`
  suma su precio de hoy, el renglón muestra `Antes: $X` y la nota
  `Atención, al menos uno de los artículos cambió de precio.` aparece en el resumen colapsado sin
  depender del color; un payload sin `items` no pinta lista ni `NaN`.
- `shop-cart.store.spec.ts` — el registro llega completo desde `GET` y sobrevive al `PUT` posterior a
  una limpieza.
- `e2e/cart-request.spec.ts` — el comprador pide, expande el card, lee la leyenda y la pastilla
  `Vigente`; el vendedor despublica; al recargar, el renglón dice `Despublicado`, su importe es `$0.00`
  y el total de la solicitud también, mientras la selección aparece vacía.
- Gate: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:api`,
  `npm run test:api:db:branch` (la lectura SQL se toca; no hay migración nueva),
  `npm run test:web:shop`, `npm run test:web:frontend`, `npm run build`, `npm run build:web:shop`,
  `npm run build:web:frontend`, `npm run typecheck:e2e`, `npm run test:e2e:branch` y, por el delta del
  tile A3, `npm run test:web:wiki` y `npm run build:web:wiki`.

## 8. Orden de implementación

1. Funciones puras y tipos de `shared` con sus consumidores.
2. Fragmento SQL compartido, lectura abierta y presenters.
3. Pruebas de frontera y de base.
4. Store, métodos, plantilla y pruebas del card en `shop`.
5. Arnés e2e.
6. Correcciones de fuente, delta del wiki y gate.

## 9. Rama, base y entrega

El corte **no toca esquema**: no hay `db:migrate:*` que aplicar ni número de migración que reservar.
Vive en el árbol de trabajo y se cierra con su commit. La base de dev branch se usa **solo** para
`test:api:db:branch`, que ejercita la lectura real; su esquema ya está aplicado y no cambia.

## 10. Correcciones de fuente que el corte exige

- `resumen-funcional` §3 y §4 — promoción de B9 (`request-record`) **ya escrita con este plan**.
- `decisiones` §44 — actualización de B9: el comprador lee su solicitud abierta con la derivación de B8,
  un importe vigente con los no disponibles en cero y el precio de hoy cuando cambió —con la nota
  `Atención, al menos uno de los artículos cambió de precio.`—; el importe congelado del panel no cambia.
- `estructura-ui` §4 — la página del carrito gana el card `Registro de Artículos solicitados`.
- `wiki` tile A3 — el claim del carrito del comprador publica el registro y su importe vigente; cabecera
  de frescura al día.
- `backlog` — fila B9 con su estado y su fecha de revisión.

## 11. Riesgos y disparadores

| Riesgo                                                       | Qué lo dispara                                     | Qué se hará                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Dos importes que se leen como uno                            | el comprador compara el suyo con el del vendedor   | cada renglón y cada total dice qué mide; el del vendedor sigue llamándose congelado           |
| El importe vigente se lee como una re-cotización             | un `price_changed` con precio nuevo                | el total usa el precio de hoy, el renglón muestra `Antes: $X` y la nota lo avisa sin expandir |
| Un `state` `undefined` se pinta como una pastilla rara       | borde anterior a B8/B9 sirviendo la pantalla nueva | solo se pinta con un estado conocido; sin `items` queda la referencia y el enlace             |
| La pantalla confunde «carrito vacío» con «solicitud perdida» | despublicación que vacía la selección              | el card del registro vive fuera del bloque de la selección y se conserva                      |
| La derivación se duplica y se separa del panel               | una segunda consulta copiada a mano                | el fragmento `LATERAL` es una constante única y una prueba de base la recorre                 |
| El comprador espera historial                                | pide una solicitud nueva y la anterior desaparece  | está declarado en §2; el historial es un corte propio con su card ya preparado                |

## 12. Alternativas evaluadas

- **A. Publicar también las solicitudes cerradas (historial).** Es lo que pedía la lectura literal de
  B9, pero el dueño corrigió el 2026-11-07: **solo la abierta**. Se descarta; se reabre con un corte de
  historial, y el card genérico del §5 ya deja el lugar.
- **B. Un campo `lastRequest` aparte de `request`.** Duplica `id`, `reference`, `requestedAt` y
  `whatsappUrl` en la misma respuesta y deja dos formas del mismo hecho. Se descarta: `request` es el
  registro.
- **C. El importe del renglón con `price_changed` a precio de la instantánea.** Era la propuesta inicial
  del plan; el dueño la corrigió el 2026-11-07: el comprador necesita el precio **de hoy** y una nota
  visible de que algo cambió. El renglón y el total usan el precio actual, el renglón conserva el
  anterior como `Antes`, y el card muestra `Atención, al menos uno de los artículos cambió de precio.`
  La instantánea sigue intacta en la base y en el panel del vendedor.
- **D. Un endpoint `GET …/cart/request`.** Una lectura más por visita con sesión (B5 mide justamente
  eso) para un dato que el carrito ya trae. Se descarta.
- **E. Guardar el importe vigente o el estado en la solicitud.** Exige migración y escribe en un acto
  ajeno; B8 ya lo descartó y este corte no lo reabre.

## 13. Cierre

- **Evidencia observada (2026-11-07).**
  - `backend/test/routes/cart.test.ts` — el registro publica los cinco estados, el importe vigente deja
    en `0` lo despublicado, vendido y eliminado, `price_changed` suma el precio de hoy y el `POST`
    devuelve la misma forma que la recarga.
  - `backend/test/db/cart.test.ts` — sobre Postgres, la lectura abierta y la del panel derivan con el
    mismo fragmento: `price_changed`, `current`, `unpublished` y `deleted`, con la instantánea intacta.
  - `shop/src/app/cart/shop-cart.component.spec.ts` — el card nace colapsado, expande a
    `Registro de Artículos solicitados`, pinta las cinco pastillas, deja los no disponibles en
    `$0.00 MXN`, muestra `Antes: $1,250.00 MXN` y la nota de precio; un borde anterior a B9 conserva el
    aviso de 4e sin `NaN`.
  - `e2e/cart-request.spec.ts` — el comprador expande el card y lee `Vigente` con su total; el vendedor
    despublica y, al recargar, el renglón dice `Despublicado` con importe y total en `$0.00 MXN`,
    mientras la selección aparece vacía.
- **Gate en verde.** `typecheck`, `lint`, `format:check`, `test:api` (280), `test:api:db:branch` (307/307
  en 45 archivos, tras limpiar las sesiones fijas que `item-photos` deja en el sandbox),
  `test:web:shop` (70), `test:web:frontend` (193), `build`, `build:web:shop`, `build:web:frontend`,
  `typecheck:e2e`, `test:e2e:branch` (23 passed), `test:web:wiki` (13) y `build:web:wiki`.
- **Wiki:** delta del tile A3 —el carrito del comprador publica el registro y su importe vigente, con el
  estado derivado una sola vez—; el tile A1 enlaza el mismo estado y no lo reescribe.
- **Hallazgo a la bandeja:** `test/db/item-photos.test.ts` usa tres tokens fijos y no limpia sus
  sesiones, así que una segunda corrida contra el mismo sandbox choca con `session_token_hash_key`.
  Disparador: la próxima corrida de `test:api:db:branch` que no parta de un sandbox limpio.
- **Revisión `live` del dueño (2026-11-07):** B9 funciona en remoto: el comprador abre
  `/carrito/:publicSlug`, expande el card `Registro de Artículos solicitados` y lee sus renglones con el
  estado de cada artículo y el importe vigente. El panel del vendedor no cambió, que es el corte: sigue
  con el aviso de B8 y el importe congelado.
- **Commit del ciclo:** `c899f42`.
