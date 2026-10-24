# @mudanzapp/wiki

SPA mínima de una ruta (Angular v22 standalone, zoneless, Tailwind v4, plantillas `.html`
separadas) del monorepo MudanzApp.

- **Dev**: `npm run dev -w wiki -- --port 4201` desde la raíz. El puerto `4200` lo usa
  `frontend`; el segundo frontend queda en `4201`. El proxy `/api` apunta al backend local en
  `:3000`.
- **Build**: `npm run build:web:wiki` desde la raíz.
- **Tests unitarios**: `npm run test:web:wiki` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`.
