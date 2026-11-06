# Plan del ciclo F3 — `despublicar`: el vendedor retira una ficha sin destruirla y el comprador lo sabe

> **Estado:** **plan ejecutable, en implementación.** Migración `013` declarada; sin commit ni gate
> remoto todavía.
> **Hipótesis:** un vendedor puede retirar del catálogo un artículo publicado y devolverlo después con
> la misma URL, y un comprador que lo tenía en su selección recibe un aviso con el nombre del artículo
> en vez de perder la fila en silencio.
> **Fuentes:** [`backlog`](backlog-funcionalidades-pendientes.md:1) fila F3;
> [`plan-ciclo-3c`](plan-ciclo-3c-publicacion-articulo.md:465) §10;
> [`plan-ciclo-4e`](plan-ciclo-4e-carrito-seleccionados-whatsapp.md:1);
> [`modelo-datos`](../.plans/modelo-datos-app-mudanzapp.md:1) §1;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1) §40 y §44.

## 0. Hecho o decisión que abre el corte

Decisión del dueño del **2026-11-06**, en la apertura de este ciclo:

| Pregunta                                 | Respuesta                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| ¿Cómo se representa el retiro?           | `app.listing.unpublished_at` aditivo; no se borra la fila, el `slug` ni la foto.                |
| ¿Una ficha vendida se puede despublicar? | **No**: `sold_at` es la evidencia de la venta (§40).                                            |
| ¿Qué pasa al republicar?                 | La misma URL vuelve; `published_at = now()`, así que la ficha sube al tope del índice.          |
| ¿Qué responde la URL retirada?           | `410 listing_unpublished` con `noindex` (no `404`).                                             |
| ¿Qué hace el carrito con ella?           | La **retira automáticamente** y muestra un aviso que nombra el artículo.                        |
| ¿Dónde está la UI?                       | `Despublicar`/`Republicar` en `frontend` Capturados; indicador y aviso en el carrito de `shop`. |

## 1. Hipótesis y corte

- **Qué compra:** el acto explícito de despublicar y su reverso, con la URL estable y el comprador
  informado; el vendedor deja de tener que borrar la captura para retirar un artículo del catálogo.
- **Qué no compra:** editar el `slug` (F2), tarjeta `og:*` por artículo (F4), congelar una ficha vendida
  (F6), lápida `410` para un artículo **borrado** (E5), purga de caché del Worker, ni un dashboard nuevo.
- **Costo declarado:** una columna aditiva, una ruta `DELETE`, una rama `410` en las dos lecturas
  públicas, un campo en `ItemSummary`, dos botones en `frontend`, un campo y una limpieza en el carrito
  de `shop`, y pruebas de API/UI. **Sin dependencias nuevas.**

## 2. Fuera de este corte

- No se borra la fila de `app.listing`, ni el artículo, ni la foto, ni el objeto del almacén.
- No se toca `slug` ni se agrega historia de URLs (F2).
- No se cambia la política de caché del Worker: la copia de borde puede servir la ficha hasta que
  expire su `max-age` (60 s) o su `stale-while-revalidate`; el backend cambia de inmediato.
- No se despublica una ficha vendida.
- No se agrega un aviso global de toasts (D3): el aviso vive en el carrito.
- No se implementa el barrido de objetos huérfanos (C1).

## 3. Datos

`backend/sql/013_listing_unpublish.sql`:

```sql
ALTER TABLE app.listing ADD COLUMN IF NOT EXISTS unpublished_at timestamptz;
```

- Aditivo, idempotente y sin `DROP`.
- `NULL` es «a la vista»; un instante es «retirada».
- El `UPDATE` de despublicar usa `COALESCE(unpublished_at, $2)` para conservar el primer instante y
  `AND sold_at IS NULL` para que una venta no se retire aunque dos peticiones compitan.
- Republicar limpia `unpublished_at` y escribe `published_at = now()`.

## 4. Contrato

```text
POST /events/:eventId/items/:itemId/listing
201 { slug, path }            primera publicación
200 { slug, path }            ya publicada (idempotente) o republicada
404 not_found | item_not_found
409 listing_photo_required    sin foto o sin las tres variantes

DELETE /events/:eventId/items/:itemId/listing
204                           despublicada, ya despublicada o nunca publicada
404 not_found | item_not_found
409 item_sold                 la venta es evidencia y no se retira

GET /public/listings/:slug
200 ficha                    a la vista (con noindex si está vendida dentro de la cortesía)
404 not_found                no existe o no cumple el patrón
410 listing_unpublished      retirada por el vendedor
410 listing_gone             vendida y fuera de la cortesía

GET /public/events/:publicSlug
200 índice                   solo fichas a la vista (ni vendidas ni despublicadas)

GET|PUT /public/events/:publicSlug/cart
PublicCart.items             solo lo que se puede pedir o quitar
PublicCart.unpublished       [{ slug, title }] retirados del carrito (F3)
CartWriteResult.unpublished  los retirados por el `PUT`, con su título
POST .../cart/request
409 listing_not_published    el carrito aún conserva una fila retirada
```

`ItemSummary` publica además `unpublishedAt: string | null`; `publishedSlug` se conserva para que la UI
distinga «despublicado» de «en proceso».

## 5. Superficies y UI

- `frontend` → `/eventos/:eventId/capturados`:
  - ficha a la vista: enlace, copiar y `Despublicar` (sin confirmación: es reversible);
  - ficha retirada: estado `despublicado`, sin enlace ni venta, botón `Republicar`;
  - una ficha vendida no ofrece `Despublicar` ni `Marcar vendido` de nuevo.
- `frontend` → Dashboard `Capturas`: `Eliminar` sigue siendo un acto aparte, solo del administrador,
  con confirmación en dos toques y copy que declara que destruye la captura, el enlace y su presencia
  en las selecciones; remite a `Despublicar` para el retiro reversible. El borrado no promete aviso
  al carrito: la cascada de `app.cart_item` lo impide sin un tombstone o una instantánea nuevos.
- `shop` → `/:slug`: `410 listing_unpublished` muestra «Este artículo ya no está publicado»; no se
  confunde con la venta cerrada.
- `shop` → `/carrito/:publicSlug`: el aviso `cart-unpublished` nombra el artículo retirado y se puede
  descartar; la limpieza automática deshabilita el pedido mientras corre.

## 6. Cambios por archivo

| Archivo                                                          | Cambio                                                                                        | Por qué                                          |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `backend/sql/013_listing_unpublish.sql`                          | columna `unpublished_at`                                                                      | el retiro es un hecho persistente, no un borrado |
| `shared/src/item.ts`                                             | `ItemSummary.unpublishedAt`                                                                   | la UI privada distingue retirada de en proceso   |
| `shared/src/cart.ts`, `shared/src/index.ts`                      | `UnpublishedCartItem`, `PublicCart.unpublished`, `CartWriteResult.unpublished`                | el aviso viaja con su título                     |
| `backend/src/store/listing-store.ts`                             | selección de la columna, `upsertListing` que republica, `unpublishListing`, filtro del índice | una sola verdad del retiro                       |
| `backend/src/store/item-store.ts`                                | `unpublishedAt` en la lectura del artículo                                                    | `Capturados` lo pinta                            |
| `backend/src/store/cart-store.ts`                                | `unpublishedAt` y título en las filas del carrito                                             | el `PUT` distingue el motivo                     |
| `backend/src/routes/listings-router.ts`                          | `DELETE`, republicación, `410 listing_unpublished`                                            | el acto y su reflejo público                     |
| `backend/src/routes/cart-router.ts`                              | `unpublished` en el `PUT` y negativa del pedido                                               | el carrito no pide una ficha retirada            |
| `backend/src/routes/presenters.ts`                               | mapeo de `unpublishedAt` y del carrito                                                        | el `snake_case` no cruza el borde                |
| `backend/src/errors.ts`                                          | `listing_unpublished` (410)                                                                   | código estable                                   |
| `frontend/src/app/items/item-status.ts`, `item-list.component.*` | estado y botones                                                                              | el vendedor retira y repone                      |
| `frontend/src/app/events/event-items.store.ts`                   | `unpublish()` y su fallo                                                                      | el acto vive en el store del evento              |
| `shop/src/app/listing/listing.component.*`                       | rama `410 listing_unpublished`                                                                | el visitante entiende el retiro                  |
| `shop/src/app/cart/shop-cart.store.ts`, `shop-cart.component.*`  | aviso y limpieza automática                                                                   | el comprador sabe qué pasó                       |
| `e2e/publish.spec.ts`, `e2e/cart-request.spec.ts`                | retiro, `410`, índice y aviso                                                                 | evidencia ejecutable                             |

## 7. Evidencia

- `npm run test:api`: el `PUT` devuelve `unpublished` con el título; la lectura del carrito lo oculta;
  el pedido responde `409 listing_not_published`; la ficha retirada responde `410 listing_unpublished`
  con `noindex` y la página también.
- `npm run test:web:frontend`: `despublicado` sin enlace, `Despublicar` hace `DELETE` y recarga,
  `Republicar` hace `POST` y recarga.
- `npm run test:web:shop`: la lectura revela el retirado, la tienda escribe el carrito limpio y conserva
  el aviso hasta descartarlo.
- `npm run typecheck:e2e`: el arnés compila con los contratos nuevos.
- `npm run test:e2e`: despublicar responde `410` y vacía el índice; republicar devuelve la misma URL;
  el carrito del comprador muestra el aviso y pierde la fila.

Gate proporcional de [`workflow-ciclos`](workflow-ciclos.md:149) §7: `typecheck`, `lint`,
`format:check`, `test:api`, `test:web:frontend`, `test:web:shop`, `typecheck:e2e`,
`build:web:frontend`, `build:web:shop`; con base y dev branch, `db:migrate:branch:test` antes de
`test:api:db:branch` y `test:e2e:branch`.

## 8. Orden de implementación

1. Migración `013` y actualización de `modelo-datos` §1.
2. Contratos compartidos (`ItemSummary`, `PublicCart`, `CartWriteResult`).
3. Store y presentadores del backend.
4. Rutas de publicación, carrito y lecturas públicas.
5. UI de `frontend` Capturados y su store.
6. UI de `shop` (ficha y carrito).
7. Pruebas de API, frontend, shop y e2e.
8. README, plan, backlog y delta de wiki.
9. Gate local, un comando por invocación.

## 9. Rama, base y entrega

- La experimentación de datos vive en la **dev branch** única y estable; la rama principal no es
  sandbox.
- La migración se aplica a mano con `db:migrate:branch:test` para el gate y con
  `db:migrate:branch`/`db:migrate` donde corresponda; el arranque no migra.
- Nada de este corte se integra si el gate contradice la hipótesis.

## 10. Correcciones de fuente que el corte exige

- [`modelo-datos`](../.plans/modelo-datos-app-mudanzapp.md:1) §1: `app.listing` gana `unpublished_at`
  y la regla de que una ficha vendida no se despublica.
- [`README`](../README.md:253) §8: la tabla de publicación gana `DELETE` y el `410`.
- [`backlog`](backlog-funcionalidades-pendientes.md:141) F3: el corte y la migración `013` quedan
  declarados; el cierre espera el gate y el commit.
- [`backend/package.json`](../backend/package.json:21): `test:db` y `test:db:branch` ahora pasan
  `--test`. El gate documentado (`test:api:db` y `test:api:db:branch`) derivaba la URL de pruebas,
  pero los scripts apuntaban a `main` y a `_branch`; la corrección es la que hace que las corridas de
  base usen `_test` y `_branch_test`, no un destino protegido.

## 11. Riesgos y disparadores

| Riesgo                                                 | Qué lo dispara                                              | Qué se hará                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| La copia de borde sigue mostrando la ficha hasta ~60 s | El dueño espera un retiro instantáneo en el dominio público | Purga o cambio de caché en un corte propio (C2/F3-bis); hoy se declara el límite               |
| Un cliente viejo no entiende `unpublished`             | Un `PUT` con una fila retirada                              | El contrato es aditivo; el `PUT` la retira igual y el aviso es opcional para el cliente        |
| Republicar reordena el catálogo                        | Una ficha que vuelve al tope sin querer                     | Es la decisión del dueño: republicar es un acto y mueve `published_at`                         |
| El carrito conserva la fila si la limpieza falla       | Red caída durante el `PUT`                                  | El aviso permanece; el pedido responde `listing_not_published` y el comprador puede reintentar |
| Una venta y un retiro compiten                         | Dos peticiones simultáneas                                  | El `UPDATE` exige `sold_at IS NULL`; la venta gana y el retiro no escribe                      |

## 12. Alternativas evaluadas

| Alternativa                                                | Por qué se descartó                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Borrar la fila de `app.listing`                            | La cascada de `app.cart_item` haría desaparecer el artículo del carrito sin aviso y perdería el `slug` |
| Mantener la fila visible como «despublicada» en el carrito | El dueño eligió retirarla con aviso; una fila inerte no se puede pedir                                 |
| Responder `404` en la URL retirada                         | El dueño eligió `410`: el enlace existió y ya no está                                                  |
| Despublicar también una ficha vendida                      | La venta es la evidencia (§40) y ya retira la ficha del catálogo                                       |

## 13. Cierre (se escribe al cerrar)

Evidencia local observada el **2026-11-06**:

- `npm run db:migrate:test`: 12 migraciones aplicadas al sandbox `_test` (incluye `013`).
- `npm run test:api`: 274 pruebas en verde.
- `npm run test:api:db`: 299 pruebas en verde, incluidas las suites de base.
- `npm run db:migrate:branch:test` y `npm run test:api:db:branch`: 12 migraciones aplicadas a
  `_branch_test` y 299 pruebas en verde.
- `npm run test:web:frontend`: 146 pruebas en verde.
- `npm run test:web:shop`: 62 pruebas en verde.
- `npm run test:web:wiki`: 13 pruebas en verde.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`,
  `npm run build:web:frontend`, `npm run build:web:shop` y `npm run build:web:wiki`: en verde (los
  builds de frontend conservan el aviso de presupuesto ya conocido).
- `npm run test:e2e -- e2e/cart-request.spec.ts` y
  `npm run test:e2e -- e2e/publish.spec.ts`: en verde. La corrida completa arrastra dos fallos de
  wiki ajenos a F3: `/foto-a-ficha` ya no existe por diseño y el humo genérico espera la página de
  estado en `/`, que en `wiki` es el índice; ambos son deuda previa del arnés.

Pendiente del dueño: aplicar `013` al destino principal que corresponda (`db:migrate`,
`db:migrate:branch` y/o `db:migrate:remote:branch`) y ejecutar el commit convencional
`feat(api): unpublish a listing and keep the cart informed` con su delta de wiki.
