# @mudanzapp/frontend

Workspace Angular v22 (standalone, zoneless, Tailwind v4, plantillas `.html` separadas) del
monorepo MudanzApp.

- **Dev**: `npm run dev:web:frontend` desde la raíz (puerto `4200`). El proxy `/api` apunta al
  backend local en `:3000`.
- **Build**: `npm run build:web:frontend` desde la raíz.
- **Tests unitarios**: `npm run test:web:frontend` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`.
