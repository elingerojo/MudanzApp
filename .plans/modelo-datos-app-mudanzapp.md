# Modelo de datos — MudanzApp

> **Estado:** seis tablas del corte de identidad del ciclo 1, con su DDL en
> [`backend/sql/002_identity.sql`](../backend/sql/002_identity.sql:1) y el corte de la invitación
> canjeable en [`backend/sql/003_redeemable_invitation.sql`](../backend/sql/003_redeemable_invitation.sql:1),
> las dos tablas del corte de captura del ciclo 3a en
> [`backend/sql/004_item.sql`](../backend/sql/004_item.sql:1), la tabla de publicación del ciclo 3c en
> [`backend/sql/005_listing.sql`](../backend/sql/005_listing.sql:1) y la de las tres variantes de la
> foto en [`backend/sql/006_item_photo_variant.sql`](../backend/sql/006_item_photo_variant.sql:1).
> Este documento es la fuente única del modelo; el DDL debe coincidir con él.
> **Dueño:** Architect / Backend. **Disparador de revisión:** nueva tabla, migración o cambio de
> contrato.

## 1. Estado

El corte de identidad del ciclo 1 introduce las seis primeras tablas de negocio. La invitación es una
capacidad acotada —72 horas y cinco canjes— y admite sesiones de evento sin identidad
(`decisiones` §30). El corte de captura del ciclo 3a agrega el artículo y su foto. El corte de
publicación del ciclo 3c agrega `app.listing`: el estado publicado vive ahí y no en `app.item`, y la
foto de un artículo publicado se lee **sin sesión** desde la base pública del almacén (decisión §26).
El corte 3c-optimizar agrega `app.item_photo_variant`: la foto se guarda en tres tamaños estándar
—`thumb` 320 px, `medium` 768 px y `large` 1440 px de lado mayor— y el peso **no** entra al modelo
(decisión §33). El corte de `ai-draft` (ciclo 3d) **no agrega ninguna tabla ni columna**: el borrador
de la IA es efímero —se valida en la frontera y no se persiste— y `app.item` solo cambia de contenido
cuando el humano confirma la revisión con `PATCH`, sobre las mismas columnas (decisión §34).

El **ciclo 4** está aprobado y se implementa un corte a la vez. El **4a (`event-index`) está
implementado** y su DDL vive en
[`007_event_public_slug.sql`](../backend/sql/007_event_public_slug.sql:1), que agrega
`app.event.public_slug`. Los cortes restantes siguen declarados antes de que exista su DDL, que es el
orden normal: el 4b agrega `app.item.price_cents` y `app.listing.sold_at`; el 4c agrega
`app.event.admin_user_id`; el 4e agrega `app.purchase_interest`; y el 4f agrega `app.cart` y
`app.cart_item` (decisiones §35 a §40). Esos cambios no viven todavía en `backend/sql/`: los archivos
`008`–`011` están **reservados** y solo se crean con su corte, aditivos, idempotentes y sin `DROP`,
como los anteriores.

| Tabla | Propósito | Columnas clave |
| --- | --- | --- |
| `app.user` | Sujeto: administrador, cuenta vinculada al evento o comprador | `id`, `display_name`, `account_status`, `is_admin`, `created_at` |
| `app.auth_factor` | Cómo se prueba el sujeto; aditivo por diseño | `id`, `user_id`, `kind`, `issuer`, `subject`, `created_at`, `last_used_at` |
| `app.session` | Prueba temporal por dispositivo; de cuenta o de evento | `id`, `user_id`, `event_id`, `token_hash`, `scope`, `device_label`, `created_at`, `last_seen_at`, `revoked_at` |
| `app.invitation` | Capacidad de entrada a un evento, acotada en tiempo y en canjes | `id`, `event_id`, `token_hash`, `created_by`, `expires_at`, `use_count`, `consumed_at`, `consumed_by`, `claimed_at`, `revoked_at` |
| `app.event` | El evento de mudanza | `id`, `owner_user_id`, `public_slug`, `admin_user_id`, `origin_city`, `destination_city`, `currency`, `state` |
| `app.event_member` | Quién participa y con qué rol | `event_id`, `user_id`, `role`, `invited_by`, `joined_at` |
| `app.item` | Artículo documentado del evento | `id`, `event_id`, `title`, `note`, `width_cm`, `height_cm`, `depth_cm`, `weight_kg`, `price_cents`, `created_at` |
| `app.item_photo` | Foto de un artículo, una por posición; sus columnas describen el tamaño `large` | `id`, `item_id`, `object_key`, `content_type`, `byte_size`, `position`, `created_at` |
| `app.item_photo_variant` | Objeto de cada tamaño estándar de la foto | `photo_id`, `variant`, `object_key`, `content_type`, `width_px`, `height_px`, `created_at` |
| `app.listing` | Estado publicado del artículo y su URL legible | `id`, `item_id`, `slug`, `published_at`, `sold_at`, `created_at` |
| `app.purchase_interest` | Quién quiere qué artículo, hasta que el vendedor lo descarta | `id`, `listing_id`, `user_id`, `title_snapshot`, `price_cents_snapshot`, `created_at`, `dismissed_at`, `dismissed_by`, `cancelled_at` |
| `app.cart` | Carrito de un visitante dentro de un evento | `id`, `user_id`, `event_id`, `created_at`, `updated_at` |
| `app.cart_item` | Artículo dentro de un carrito | `cart_id`, `listing_id`, `added_at` |

Restricciones que van con el DDL:

- unicidad `(issuer, subject)` en `app.auth_factor`;
- índice único parcial que garantice **un solo** administrador;
- `app.session.scope` con valores `app` y `shop`;
- `session_owner_check`: una sesión es **o** de cuenta (`user_id` no nulo, `event_id` nulo) **o** de
  evento (`event_id` no nulo, `user_id` nulo); nunca ambas y nunca ninguna. La sesión de evento tiene
  la misma forma que la de cuenta salvo que no tiene sujeto: prueba pertenencia a un evento, no
  identidad (`decisiones` §30);
- la invitación dura **72 horas desde su emisión** y admite **cinco canjes** (`INVITATION_TTL_MS` e
  `INVITATION_MAX_USES` en el núcleo de la regla); `consumed_at` marca el primer canje y `use_count`
  cuenta todos. `claimed_at` es **histórico**: el reclamo ya no la inutiliza (`decisiones` §30,
  revisada), así que ningún camino lo escribe y el veredicto `claimed` del núcleo se conserva para
  leer las filas anteriores. `revoked_at` queda para la revocación del administrador;
- `event_member.invited_by` registra al **dueño del evento**: es el único invitante de registro que el
  modelo reconoce (`decisiones` §30) y no distingue qué co-dispositivo emitió el enlace;
- ningún campo de nombre, correo, teléfono ni dirección del visitante;
- `app.item_photo.content_type` se limita a `image/jpeg`, `image/png` y `image/webp`; `object_key` es
  único y hay una sola fila por `(item_id, position)`; borrar el artículo borra sus fotos
  (`ON DELETE CASCADE`). Los bytes viven en el almacén de objetos detrás de `R2_MODE`, no en la base;
- `app.item_photo_variant` tiene una fila por `(photo_id, variant)`, `object_key` único y
  `variant` acotado a `thumb`, `medium` y `large`. Su `content_type` se limita a `image/jpeg` y
  `image/webp`, que es la salida del codificador del dispositivo. Cae en cascada con la foto y
  **no guarda el peso** (`plan-ciclo-3c-optimizar` §5);
- **ninguna regla de peso ni de tamaño vive en la base:** el único límite de tamaño es
  `ITEM_PHOTO_SIZES` en el código, compartido por el navegador y la frontera, y el único objetivo de
  peso es el del codificador (`ITEM_PHOTO_ENCODING`). Ajustar un tamaño no exige migración y ninguna
  variante se rechaza por su peso;
- `app.item_photo` **no cambia de forma**: sus columnas heredadas —`object_key`, `content_type` y
  `byte_size`— describen el tamaño `large` y siguen siendo obligatorias, así que la subida de ese
  tamaño las rellena. `byte_size` sobrevive como peso del tamaño `large`: nadie lo lee y se retira con
  la contracción (`backend/sql/contract/`) cuando el GC elimine las fotos anteriores al ciclo;
- `app.item` no guarda estado de publicación y **sí** guarda el precio: el estado publicado es
  `app.listing`. Un artículo sin fila en `app.listing` no está publicado;
- `app.listing.item_id` es **único**: publicar es idempotente y republicar devuelve la misma fila y la
  misma URL. `slug` es único y su `CHECK` exige entre 3 y 140 caracteres con el patrón
  `^[a-z0-9]+(-[a-z0-9]+)*$`. El `slug` se deriva del título más seis caracteres del `itemId` y **no**
  se reescribe al cambiar el título: una URL compartida es un hecho publicado (`plan-ciclo-3c` §3);
- publicar exige foto **en sus tres tamaños**: `app.listing` no lo impone por DDL —la foto y sus
  variantes se suben por separado—, así que la regla vive en el borde (`listing_photo_required`, 409)
  y en su ciclo. Una foto anterior a 3c-optimizar no tiene filas de variante y no puede publicarse por
  primera vez; los ya publicados siguen respondiendo `200`;
- la **retención** aprobada es «la foto vive mientras exista el `listing`»: `app.item_photo` cae en
  cascada con el artículo, pero el objeto del bucket **no**. El barrido de huérfanos es manual y hoy
  no tiene script (`plan-ciclo-3c` §10).

El esquema arranca con el marcador idempotente `CREATE SCHEMA IF NOT EXISTS app` de
[`backend/sql/001_init.sql`](../backend/sql/001_init.sql). Las seis tablas del corte de identidad
viven en [`backend/sql/002_identity.sql`](../backend/sql/002_identity.sql:1), las del artículo en
[`backend/sql/004_item.sql`](../backend/sql/004_item.sql:1), la publicación en
[`backend/sql/005_listing.sql`](../backend/sql/005_listing.sql:1) y las variantes de la foto en
[`backend/sql/006_item_photo_variant.sql`](../backend/sql/006_item_photo_variant.sql:1), escritos con
la forma de §9: aditivos, idempotentes (`IF NOT EXISTS` en tablas e índices), sin `DROP` y sin
transacción propia. El archivo aplicado no se edita (§9, regla 6); un cambio nuevo se añade con otro
archivo.

Restricciones que el ciclo 4 agrega, cuando su corte escriba el DDL:

- `app.event.public_slug` es único, cumple el mismo patrón que el `slug` del artículo y **no se
  reescribe** una vez emitido: el enlace existe desde que el evento se crea (decisión §36).
  `app.event.admin_user_id` es el event-administrator reclamado por la primera autenticación de un
  invitado de ese evento y no cambia después (decisión §37);
- `app.item.price_cents` es **nulo** por defecto y su moneda es `app.event.currency`, nunca una columna
  propia; un precio nulo no impide publicar y deshabilita la pulsación de interés (decisión §35);
- `app.listing.sold_at` marca `Vendido` en cualquier estado, sin monto y sin exigir precio. Borrar un
  artículo **no** es venderlo (decisión §40);
- `app.purchase_interest` guarda **una fila por artículo y visitante** mientras está abierta, con
  instantánea de título y precio, y su referencia al `listing` **puede quedar nula** si el vendedor
  borra el artículo: la solicitud sobrevive al borrado. No bloquea, no vence y no cambia el estado del
  artículo (decisión §38);
- `app.cart` tiene una fila por (visitante, evento) y `app.cart_item` una por (carrito, artículo). La
  tabla es la verdad y **el total no se guarda**: se deriva en `shared` (decisión §39).

Candidatas sin compromiso, cada una con su ciclo: `app.sale` —solo si el monto de una venta llega a
tener consumidor—, `app.packing_step`, `app.packing_material` y `app.receive_check`.
`app.reservation` **no existe ni se creará**: el apartado de 15 minutos fue sustituido por
`app.purchase_interest` (decisión §38, que supera a §25).

## 2. Motor

- Postgres (Neon).
- SQL crudo y parametrizado con `pg`.
- Sin ORM ni query builder.

## 3. Convenciones de nombres

- Identificadores en minúsculas y sin ambigüedad.
- Las tablas de negocio se añaden con su corte vertical, no por adelantado.
- El nombre interno `mudanzapp` es el prefijo técnico cuando aplique.

## 4. Bases y dev branch

| Base | Uso | Derivación | Entorno |
| --- | --- | --- | --- |
| `mudanzapp` | Desarrollo principal | `DATABASE_URL` | Local y remoto |
| `mudanzapp_test` | Pruebas de la principal | Sufijo `_test` | Local |
| `mudanzapp_branch` | Dev branch estable | Sufijo `_branch` | Local y remoto |
| `mudanzapp_branch_test` | Pruebas de la dev branch | Sufijo `_test` sobre la dev branch | Local |

- La dev branch es única y estable; no se crea una por experimento.
- Local tiene las cuatro bases. Remoto solo tiene `mudanzapp` y `mudanzapp_branch`; las bases `_test` son
  **local-only** y no hay tests en producción.
- La rama principal no es un sandbox.

## 5. Derivación de URLs

- La URL de pruebas se deriva de `DATABASE_URL`: mismo rol, host, puerto y parámetros, con el
  sufijo `_test` en el nombre de la base: `mudanzapp` → `mudanzapp_test`.
- La URL de la dev branch se deriva con `_branch`: `mudanzapp` → `mudanzapp_branch`.
- La prueba de la dev branch se deriva añadiendo `_test` al nombre: `mudanzapp_branch` →
  `mudanzapp_branch_test`. Toda base de prueba termina en `_test`; si el nombre ya termina en
  `_test`, no se vuelve a sufijar.
- No se transportan ni se imprimen valores.
- La derivación es la **única** forma de obtener la URL. Una variable vacía cuenta como ausente.
- La derivación `_test` es local-only; en remoto solo se deriva `_branch`.

## 6. Runner

- El runner se aplica **a mano** y nunca en el arranque:
  - local: `db:migrate` (`main`), `db:migrate:test` (`test`), `db:migrate:branch` (`branch`) y
    `db:migrate:branch:test` (`branch-test`);
  - remoto: `db:migrate:remote` (`main`) y `db:migrate:remote:branch` (`branch`).
- Las bases `_test` son local-only; los objetivos de prueba remotos se rechazan con error estable.
- La conectividad se verifica con `db:ping` (local) y `db:ping:remote` (remoto); emiten solo `ok` o
  un error estable y nunca imprimen la URL.
- El e2e **no** aplica el esquema: su `globalSetup` solo verifica que exista y falla ruidosamente
  si falta. Antes de `test:e2e` se ejecuta `db:migrate:test`; antes de `test:e2e:branch`,
  `db:migrate:branch:test`.

## 7. Reglas de migración

- Solo hacia adelante e idempotentes en la ruta automática (`backend/sql/*.sql`).
- Cada cambio usa `IF NOT EXISTS` cuando el DDL lo permite; si no, una forma idempotente
  equivalente (nota E5 en `.guidelines/04` §3).
- La ruta automática no destruye: ningún archivo de `backend/sql/*.sql` usa `DROP`, porque el runner
  los ejecuta todos en cada invocación y destruirían datos por corrida.
- La contracción vive en `backend/sql/contract/`, que el runner no enumera: versionada, revisada e
  idempotente (`IF EXISTS`), aplicada a mano después de la corrida aditiva (nota E6).
- No hay tabla de seguimiento de migraciones.
- Un archivo aplicado no se edita.
- Los destinos protegidos son `mudanzapp` local y remota; `_test` y `_branch` son sandboxes que se
  destruyen y se reconstruyen con el runner.
- La rama principal conserva estas reglas; la experimentación vive en la dev branch.

## 8. Contratos de datos

- El contrato mínimo del corte define tipos, validación, forma del payload y códigos de error.
- La validación en la frontera protege el ciclo de datos corruptos; no sustituye las reglas del
  dominio.
- Todo hecho del modelo tiene un dueño y un disparador de revisión.

## 9. Convenciones de migración (detalle)

1. Un archivo por cambio, con nombre `NNN_descripcion.sql`, tres dígitos crecientes.
2. Cada cambio usa `IF NOT EXISTS` cuando el DDL lo permite; si no, se implementa de forma
   idempotente equivalente.
3. Ningún archivo de `backend/sql/*.sql` usa `DROP`: la ruta automática no destruye.
4. La contracción va en `backend/sql/contract/NNN_descripcion.sql`, con su propia secuencia, exige
   `IF EXISTS` y nunca mezcla DDL aditivo con destructivo. Se aplica a mano, después de la corrida
   aditiva del mismo destino.
5. No se crea tabla de seguimiento de migraciones.
6. Un archivo aplicado no se edita; un cambio nuevo se añade con otro archivo.
7. El runner ejecuta cada archivo en orden dentro de su propia transacción.
8. El DDL debe coincidir con este documento; si discrepan, uno está mal y debe corregirse.

## 10. Dueños y disparadores de revisión

| Hecho | Dueño | Disparador de revisión |
| --- | --- | --- |
| Tablas y columnas | Architect / Backend | Nueva tabla o cambio de contrato |
| Índices y restricciones | Architect / Backend | Consulta lenta o regla de dominio nueva |
| Convención de migración | Architect | Cambio de runner o de base |
| Derivación de URLs | Architect | Cambio de host, rol o convención |
| Matriz local/remota y comandos de migración | Architect | Cambio de topología o de runner |
| Retención de la foto publicada («mientras exista el `listing`», barrido manual de huérfanos) | Architect / Backend | Primer borrado, costo de almacenamiento visible o política de retención nueva |
| `slug` publicado (`CHECK` y derivación desde el título) | Architect / Backend | Necesidad de `slug` editable o de estabilidad entre cambios de título |
| Tamaños estándar de la foto y objetivo de peso (fuera de la base, en `ITEM_PHOTO_SIZES` e `ITEM_PHOTO_ENCODING`) | Architect / Frontend | 400 KB dejen de ser suficientes para el zoom, o aparezca un catálogo con decenas de tarjetas |
| `public_slug` del evento y su inmutabilidad (ciclo 4a) | Architect / Backend | Necesidad de renombrar un evento ya publicado |
| `admin_user_id` y la regla de reclamo (ciclo 4c) | Architect / Backend | Un evento con dos administradores |
| `price_cents` y su moneda heredada del evento (ciclo 4b) | Architect / Backend | Precio en moneda distinta o con fracciones |
| `sold_at` y la frontera entre vender y borrar (ciclo 4b) | Architect / Backend | Primera venta que haya que revertir |
| `purchase_interest` y su instantánea (ciclo 4e) | Architect / Backend | El vendedor pida exclusividad |
| `cart` y `cart_item` (ciclo 4f) | Architect / Backend | Carrito compartido entre dispositivos, o costo de lectura de carrito |
