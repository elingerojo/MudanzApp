# @mudanzapp/shop

SPA **pública e indexable** del catálogo por enlace (Angular v22 standalone, zoneless, Tailwind v4,
plantillas `.html` separadas) del monorepo MudanzApp. Es la tercera superficie: `frontend` es la
privada del administrador y de los co-dispositivos del evento, y `wiki` es el dossier técnico.

Este workspace es un **bootstrap**: existe como artefacto desplegable, con su Worker, su puerto y su
`project` en el arnés, y todavía **no** contiene capacidades de catálogo. El catálogo y la página
pública de cada artículo llegan con `publish` (ciclo 3c) y `reserve` (ciclo 4).

## Rutas

- `/` — `StatusComponent`: humo del arranque; proceso y base desde `/health`.
- `**` — redirección a `/`: fallback de la SPA.

Reglas del mapa:

- Crece **una ruta por ciclo**. `publish` sustituye `/` por la primera página publicada y abre la
  ruta por artículo; `reserve` añade catálogo y apartado.
- Mientras dure el arranque, `/` es pública e indexable a propósito: es la prueba de que el Worker
  sirve la shell y el backend responde cross-origin. No es una pantalla de producto.
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
