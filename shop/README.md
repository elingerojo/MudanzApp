# @mudanzapp/shop

SPA **pública e indexable** del catálogo por enlace (Angular v22 standalone, zoneless, Tailwind v4,
plantillas `.html` separadas) del monorepo MudanzApp. Es la tercera superficie: `frontend` es la
privada del administrador y de los co-dispositivos del evento, y `wiki` es el dossier técnico.

Este workspace arrancó como **bootstrap** y desde el ciclo 3c sirve la **primera página pública de
producto**. Todavía **no** hay catálogo ni navegación: eso llega con `reserve` (ciclo 4).

## Rutas

- `/` — `StatusComponent`: humo del arranque; proceso y base desde `/health`.
- `/:slug` — `ListingComponent`: ficha pública de un artículo publicado, leída de
  `GET /public/listings/:slug` **sin sesión**.
- `**` — redirección a `/`: fallback de la SPA.

Reglas del mapa:

- Crece **una ruta por ciclo**. `publish` (3c) abre la ruta por artículo; `reserve` (4) añade catálogo
  y apartado, y sustituye `/`.
- `/` sigue siendo pública e indexable a propósito: es la prueba de que el Worker sirve la shell y el
  backend responde cross-origin. Su sustitución por la primera página de catálogo está aplazada al
  ciclo 4 y es deuda declarada, no un defecto.
- `/:slug` no emite metadatos por ruta: WhatsApp no ejecuta la SPA y la vista previa sigue siendo la
  del sitio (decisión §28). El componente solo fija el título del documento.
- La foto pública la descarga el navegador del almacén (`R2_PUBLIC_BASE_URL`), no del backend
  (decisión §26); el contrato entrega la URL ya compuesta.
- No hay sesión de visitante en este corte: el alcance `shop` existe en el modelo de sesiones, pero
  este workspace no lo emite ni lo consume.

## Operación

- **Dev**: `npm run dev:web:shop` desde la raíz. El puerto `4200` es de `frontend` y el `4201` de
  `wiki`; `shop` queda en `4202`. El proxy `/api` apunta al backend local en `:3000`.
- **Build**: `npm run build:web:shop` desde la raíz. Emite `dist/shop/browser` y escribe la marca en
  el `<title>` del artefacto con `brand:index`.
- **Deploy**: `npx wrangler deploy -c shop/wrangler.jsonc`. El Worker es `mudanzapp-shop` y su
  `name` debe coincidir con el del dashboard.
- **Tests unitarios**: `npm run test:web:shop` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`; `shop` entra como un `project` más y el humo corre una vez contra su shell.

## Assets

- El favicon de este workspace es un SVG propio (`public/favicon.svg`) porque el arranque se versiona
  solo con texto. Si se quiere el mismo `.ico` que `frontend` y `wiki`, se copia el binario y se
  ajusta el `<link rel="icon">` de `src/index.html`.
