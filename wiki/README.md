# @mudanzapp/wiki

SPA del proyecto (Angular v22 standalone, zoneless, Tailwind v4, plantillas `.html` separadas) del
monorepo MudanzApp. No es un apéndice del arranque: es un frontend con su propio mapa de rutas y
crece una ruta por ciclo.

## Rutas

| Ruta            | Página                | Qué es                                                     |
| --------------- | --------------------- | ---------------------------------------------------------- |
| `/`             | `StatusComponent`     | Humo del arranque: proceso y base desde `/health`          |
| `/foto-a-ficha` | `FotoAFichaComponent` | Dossier §3: contrato de la IA, revisión y publicación (3d) |

- **Dev**: `npm run dev -w wiki -- --port 4201` desde la raíz. El puerto `4200` lo usa
  `frontend`; el segundo frontend queda en `4201`. El proxy `/api` apunta al backend local en
  `:3000`.
- **Build**: `npm run build:web:wiki` desde la raíz.
- **Tests unitarios**: `npm run test:web:wiki` desde la raíz (Vitest).
- **E2E**: el arnés del monorepo es **Playwright**, no `ng e2e`. Se ejecuta desde la raíz con
  `npm run test:e2e`.

## Dossier

El dossier es el producto de `wiki`: explica cómo está hecha la aplicación y por qué, como base para
colaboradores externos del proyecto open source. Cada ciclo añade **una** sección, escrita en el
mismo ciclo que produce el hecho que explica.

| Ciclo | Sección del dossier                                                           | Estado    |
| ----- | ----------------------------------------------------------------------------- | --------- |
| 1     | Identidad: dos factores y por qué el enlace de invitación muere al primer uso | Propuesta |
| 2     | Roles y superficies: por qué tres frontends y no uno                          | Propuesta |
| 3     | Foto a ficha: contrato de la IA, revisión y publicación en una pantalla       | Escrita   |
| 4     | Catálogo público: indexación, bloqueo de 15 minutos y venta fuera de banda    | Propuesta |
| 5     | La regla 4/11/21 como función pura y su justificación económica               | Propuesta |
| 6     | Empaque y cotización: de la estimación burda al dato verificable              | Propuesta |

- Una sección se escribe cuando su hecho ya existe en el código; mientras tanto su estado es
  `Propuesta` y no se documenta por anticipado.
- La superficie pública `shop` ya existe como bootstrap (ciclo 3b: workspace, puerto `4202` y Worker
  `mudanzapp-shop`), todavía sin catálogo; la sección 4 habla de su comportamiento cuando `publish` y
  `reserve` la llenen de contenido (decisión §20 de
  [`decisiones-tecnicas`](../.plans/decisiones-tecnicas-app-mudanzapp.md)).
