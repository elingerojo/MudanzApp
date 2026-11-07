# @mudanzapp/shop

SPA **pública e indexable** del catálogo por enlace (Angular v22 standalone, zoneless, Tailwind v4,
plantillas `.html` separadas) del monorepo MudanzApp. Es la tercera superficie: `frontend` es la
privada del administrador y de los co-dispositivos del evento, y `wiki` es el dossier técnico.

Este workspace arrancó como **bootstrap**, desde el ciclo 3c sirve la **primera página pública de
producto**, desde el ciclo 4a el **índice público del evento**, desde el ciclo 4b la ficha muestra
**precio y estado de venta** y también llega como snapshot, y desde el ciclo 4d tiene **cuenta de
visitante**. El ciclo 4 le agrega el interés de compra (4e) y el carrito (4f). Las rutas de este
documento son el mapa **vigente**; las de ciclo 4 se marcan como pendientes hasta que su corte las
implante.

## Rutas

- `/` — `StatusComponent`: humo del arranque; proceso y base desde `/health`.
- `/:slug` — `ListingComponent`: ficha pública de un artículo publicado, leída de
  `GET /public/listings/:slug` **sin sesión**. Desde el ciclo 4b pinta el precio con la moneda del
  evento y, si se vendió, el estado `Vendido`; el `noindex` y el `410` de la cortesía son cabeceras
  del Worker, no `<meta>` de la SPA. La página llega **ya renderizada** por el backend
  (`GET /public/listings/:slug/page`) y el Worker la guarda como snapshot; el componente la retira
  cuando su modelo está al día. Pinta tres tamaños de la foto y el grande se abre al tocar la
  mediana, sin dependencia nueva. Enlaza de vuelta al índice del evento por `event.publicSlug`.
- `/evento/:publicSlug` — `EventIndexComponent`: índice público del evento desde el ciclo 4a, leído de
  `GET /public/events/:publicSlug` **sin sesión**. Con cero artículos muestra su estado vacío y sigue
  siendo un enlace válido. Cada tarjeta abre su ficha. La página llega **ya renderizada** por el
  backend (`GET /public/events/:publicSlug/page`) y el Worker la guarda como snapshot; el componente
  la retira cuando su propia lista está al día.
- `/cuenta` — `ShopAccountComponent`: cuenta del visitante desde el ciclo 4d. Sin sesión ofrece
  `Entrar o registrarme` con el mismo flujo OAuth del evento; con sesión muestra el nombre y permite
  fijarlo **después** del primer acceso. `Cerrar sesión` es local. La sesión tiene alcance `shop` y no
  abre el evento ni la identidad privada. La barra de la shell ofrece el mismo acceso desde las páginas
  públicas y se oculta aquí.
- `/auth/callback` — `ShopOAuthCallbackComponent`: vuelta pública del proveedor. Canjea el `id_token`
  en `POST /auth/shop/sessions` y vuelve a la página que inició el flujo —`/cuenta` si no hay una
  guardada—.
- `/carrito/:publicSlug` — `ShopCartComponent`: carrito de **seleccionados** del evento (ciclo 4e). Es
  por evento, así que la ruta lleva su `publicSlug` y va antes de `:slug`. Sin sesión anuncia lo que hay
  guardado en el navegador y ofrece `Entrar`; con sesión lista los artículos con su precio, muestra el
  **importe agregado** de la selección y ofrece `Pídelos por WhatsApp`, que compone el enlace `wa.me`
  con el número configurado por el vendedor en su dashboard. Sin número, el botón queda deshabilitado
  con su motivo. El total es derivado —no hay columna nueva— y la solicitud congela el importe del
  momento de pedir; el mensaje de WhatsApp sigue llevando solo la referencia (ciclo B1, decisión §44).
- `**` — redirección a `/`: fallback de la SPA.

Reglas del mapa:

- Crece **una ruta por ciclo**. `publish` (3c) abrió la ruta por artículo; `event-index` (4a) abrió
  `/evento/:publicSlug`; `shop-account` (4d) abrió `/cuenta` y `/auth/callback`; `cart-request` (4e)
  abrió `/carrito/:publicSlug`.
- `/` sigue siendo pública e indexable a propósito: es la prueba de que el Worker sirve la shell y el
  backend responde cross-origin. El ciclo 4 **no** la sustituye: el catálogo es por evento
  (`/evento/:publicSlug`), así que no hay un catálogo global que la reemplace. La deuda de 3b se
  reclasifica —`/` es una landing mínima pendiente de decisión, no un catálogo aplazado— y el índice
  del evento es quien demuestra el camino completo con backend cross-origin.
- Ni `/:slug` ni `/evento/:publicSlug` emiten metadatos por ruta: WhatsApp no ejecuta la SPA y la
  vista previa sigue siendo la del sitio (decisión §28). La única excepción es `X-Robots-Tag:
noindex` en una ficha vendida, que el Worker propaga del backend.
- El índice y su tarjeta se pintan **dos veces** —el HTML del snapshot y el componente— desde un
  modelo único (`shared/src/card.ts`). `card-parity.spec.ts` compara ambas salidas y es lo que impide
  que se separen. La ficha hace lo mismo desde `shared/src/listing-page.ts`, con
  `listing-parity.spec.ts`.
- La foto pública la descarga el navegador del almacén (`R2_PUBLIC_BASE_URL`), no del backend
  (decisión §26); el contrato entrega la URL ya compuesta.
- La cuenta de la tienda (ciclo 4d) usa el mismo flujo OAuth que `frontend`, pero emite una sesión de
  alcance `shop` con su propia clave en `localStorage` (`mudanzapp.shop.session`). El nombre visible es
  opcional y se fija después del primer acceso; no hay membresía de evento ni inicio de sesión único
  entre superficies. El proveedor debe tener registrado `<origen-de-shop>/auth/callback` además del de
  `frontend`. El carrito (4e) consume esa sesión; la ficha y el índice no.
- La selección (ciclo 4e) vive en `localStorage` bajo `mudanzapp.shop.selected.<publicSlug>` mientras el
  visitante no tiene cuenta, y en `app.cart` cuando la tiene: al entrar, las dos listas se **unen** y se
  escriben con un `PUT` que reemplaza el carrito entero. Guardar no exige cuenta; pedir, sí. El mensaje
  de WhatsApp lleva solo la referencia de la solicitud, y el vendedor la ve en el dashboard de su
  evento. La ficha guarda con `Guardar en seleccionados` y la ruta del carrito es
  `/carrito/:publicSlug`; `carrito` está en `RESERVED_PATHS`, así que una navegación no se confunde con
  una ficha.
- La barra de cuenta de la shell aparece en las páginas públicas (`/evento/:publicSlug` y `/:slug`), se
  oculta en `/cuenta` y en `/auth/callback`, y guarda en `sessionStorage` la ruta de origen para volver
  a ella después del acceso. Solo acepta rutas internas; cualquier otro destino vuelve a `/cuenta`.

## Operación

- **Dev**: `npm run dev:web:shop` desde la raíz. El puerto `4200` es de `frontend` y el `4201` de
  `wiki`; `shop` queda en `4202`. El proxy `/api` apunta al backend local en `:3000`.
- **Build**: `npm run build:web:shop` desde la raíz. Emite `dist/shop/browser` y escribe la marca en
  el `<title>` del artefacto con `brand:index`.
- **Deploy** (paso manual del dueño, `Man-3.4`): `npm run deploy -w shop` desde la raíz. El Worker es
  `mudanzapp-shop`, su `name` debe coincidir con el del dashboard y `API_BASE_URL` vive en
  `wrangler.jsonc`; `backend/test/config/shop-worker-origin.test.ts` falla si deja de coincidir con
  `src/environments/environment.production.ts`, así que el origen del backend no tiene dos copias
  libres. El Worker sirve `/evento/*` y las navegaciones `GET` a `/:slug` desde el script; el resto de
  las rutas y los assets salen de sus assets con el fallback de SPA.
- **Snapshot**: `X-Snapshot: hit | miss | stale | shell` dice qué sirvió el Worker, tanto para el
  índice como para la ficha. `hit` es una copia guardada, `miss` una página recién renderizada y
  guardada, `stale` la última copia ante un fallo del backend y `shell` la SPA sin snapshot (evento
  vacío, sin copia, backend caído o ficha con la cortesía vencida). La copia viaja con
  `cache-control: public, max-age=60, stale-while-revalidate=600` —el valor de `plan-ciclo-4a` §5 y el
  mismo que el backend envía en `/page`— y `shell` con `no-cache`; [`worker.spec.ts`](src/worker.spec.ts:1)
  fija el texto, así que cambiarlo sin cambiar el plan falla. Una ficha vendida conserva `200` con
  `X-Robots-Tag: noindex` durante treinta días y después responde `410` con la shell y el mismo
  `noindex`.
- **Tests unitarios**: `npm run test:web:shop` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`; `shop` entra como un `project` más y el humo corre una vez contra su shell.

## Assets

- El favicon de este workspace es un SVG propio (`public/favicon.svg`) porque el arranque se versiona
  solo con texto. Si se quiere el mismo `.ico` que `frontend` y `wiki`, se copia el binario y se
  ajusta el `<link rel="icon">` de `src/index.html`.
