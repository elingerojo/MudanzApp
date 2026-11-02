# @mudanzapp/shop

SPA **pública e indexable** del catálogo por enlace (Angular v22 standalone, zoneless, Tailwind v4,
plantillas `.html` separadas) del monorepo MudanzApp. Es la tercera superficie: `frontend` es la
privada del administrador y de los co-dispositivos del evento, y `wiki` es el dossier técnico.

Este workspace arrancó como **bootstrap**, desde el ciclo 3c sirve la **primera página pública de
producto** y desde el ciclo 4a el **índice público del evento**. El ciclo 4 le agrega la cuenta del
visitante (4d), el interés de compra (4e) y el carrito (4f). Las rutas de este documento son el mapa
**vigente**; las de ciclo 4 se marcan como pendientes hasta que su corte las implante.

## Rutas

- `/` — `StatusComponent`: humo del arranque; proceso y base desde `/health`.
- `/:slug` — `ListingComponent`: ficha pública de un artículo publicado, leída de
  `GET /public/listings/:slug` **sin sesión**. Pinta tres tamaños de la foto —miniatura, mediana y
  grande— y el grande se abre al tocar la mediana, sin dependencia nueva. Enlaza de vuelta al índice
  del evento por `event.publicSlug`.
- `/evento/:publicSlug` — `EventIndexComponent`: índice público del evento desde el ciclo 4a, leído de
  `GET /public/events/:publicSlug` **sin sesión**. Con cero artículos muestra su estado vacío y sigue
  siendo un enlace válido. Cada tarjeta abre su ficha. La página llega **ya renderizada** por el
  backend (`GET /public/events/:publicSlug/page`) y el Worker la guarda como snapshot; el componente
  la retira cuando su propia lista está al día.
- `/carrito` — pendiente del ciclo 4f: carrito del visitante con sesión de alcance `shop`, con el total
  derivado y la entrega de la compra a WhatsApp.
- `**` — redirección a `/`: fallback de la SPA.

Reglas del mapa:

- Crece **una ruta por ciclo**. `publish` (3c) abrió la ruta por artículo; `event-index` (4a) abrió
  `/evento/:publicSlug`; `cart` (4f) abre `/carrito`.
- `/` sigue siendo pública e indexable a propósito: es la prueba de que el Worker sirve la shell y el
  backend responde cross-origin. El ciclo 4 **no** la sustituye: el catálogo es por evento
  (`/evento/:publicSlug`), así que no hay un catálogo global que la reemplace. La deuda de 3b se
  reclasifica —`/` es una landing mínima pendiente de decisión, no un catálogo aplazado— y el índice
  del evento es quien demuestra el camino completo con backend cross-origin.
- Ni `/:slug` ni `/evento/:publicSlug` emiten metadatos por ruta: WhatsApp no ejecuta la SPA y la
  vista previa sigue siendo la del sitio (decisión §28).
- El índice y su tarjeta se pintan **dos veces** —el HTML del snapshot y el componente— desde un
  modelo único (`shared/src/card.ts`). `card-parity.spec.ts` compara ambas salidas y es lo que impide
  que se separen.
- La foto pública la descarga el navegador del almacén (`R2_PUBLIC_BASE_URL`), no del backend
  (decisión §26); el contrato entrega la URL ya compuesta.
- Todavía no hay sesión de visitante: el alcance `shop` existe en el modelo de sesiones desde el ciclo
  1, y lo emite y lo consume el corte 4d (registro igual al primer acceso OAuth, con nombre opcional).
  El interés (4e) y el carrito (4f) exigen esa sesión; la ficha y el índice no.

## Operación

- **Dev**: `npm run dev:web:shop` desde la raíz. El puerto `4200` es de `frontend` y el `4201` de
  `wiki`; `shop` queda en `4202`. El proxy `/api` apunta al backend local en `:3000`.
- **Build**: `npm run build:web:shop` desde la raíz. Emite `dist/shop/browser` y escribe la marca en
  el `<title>` del artefacto con `brand:index`.
- **Deploy** (paso manual del dueño, `Man-3.4`): `npm run deploy -w shop` desde la raíz. El Worker es
  `mudanzapp-shop`, su `name` debe coincidir con el del dashboard y `API_BASE_URL` vive en
  `wrangler.jsonc`; `backend/test/config/shop-worker-origin.test.ts` falla si deja de coincidir con
  `src/environments/environment.production.ts`, así que el origen del backend no tiene dos copias
  libres. El Worker sirve `/evento/*` desde el script y el resto de las rutas desde sus assets con el
  fallback de SPA.
- **Snapshot**: `X-Snapshot: hit | miss | stale | shell` dice qué sirvió el Worker. `hit` es una
  copia guardada, `miss` una página recién renderizada y guardada, `stale` la última copia ante un
  fallo del backend y `shell` la SPA sin snapshot (evento vacío, sin copia o backend caído).
- **Tests unitarios**: `npm run test:web:shop` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`; `shop` entra como un `project` más y el humo corre una vez contra su shell.

## Assets

- El favicon de este workspace es un SVG propio (`public/favicon.svg`) porque el arranque se versiona
  solo con texto. Si se quiere el mismo `.ico` que `frontend` y `wiki`, se copia el binario y se
  ajusta el `<link rel="icon">` de `src/index.html`.
