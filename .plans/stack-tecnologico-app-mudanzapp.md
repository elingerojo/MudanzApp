# Stack tecnológico — MudanzApp

> **Naturaleza:** fuente única del **CÓMO**. La regla [`00-stack.md`](../.roo/rules/00-stack.md:1)
> solo fija las restricciones no negociables y apunta aquí.
> **Dueño:** Architect. **Disparador de revisión:** nueva integración, nueva dependencia de runtime,
> cambio de framework o cambio de plataforma.

## 1. Identidad

| Nombre | Naturaleza | Valor | Política |
| --- | --- | --- | --- |
| Interno fijo | Técnico, sin marca | `mudanzapp` | Se elige una vez; no se renombra |
| Público configurable | Marca | `MudanzApp` | Vive en una sola fuente; se presupuesta su renombrado |

- Los identificadores técnicos (paquetes, roles, bases, Workers, claves y repositorio) usan el
  nombre interno.
- El nombre público no se cablea en el código; se resuelve en la capa de presentación o con un
  dominio propio.
- La fuente única del nombre público es `shared/src/brand.json` con acceso tipado en
  `shared/src/brand.ts` (decisión §14.3 de `decisiones-tecnicas-app-mudanzapp.md`, con su criterio de
  crecimiento §14.3.1). El `index.html` de cada frontend no cablea la marca: el `build` de cada
  frontend ejecuta `brand:index` y `.scripts/generate-brand-index.mjs` la escribe en el artefacto
  construido, mientras la app fija el título en runtime desde la misma fuente.
- Superficies de frontend: `frontend`, `shop` y `wiki`. `frontend` es la superficie privada del
  administrador y los co-dispositivos de cada evento; `shop` es la superficie pública e indexable
  del catálogo por enlace; `wiki` es el dossier técnico del proyecto. Las tres comparten forma
  técnica (Angular, Signals, zoneless) y mapa de rutas propio (decisión §20 de
  `decisiones-tecnicas-app-mudanzapp.md`).
- Estado de cada superficie: `frontend`, `shop` y `wiki` existen como workspaces del monorepo, cada
  uno con sus scripts `dev:web:⟨FE⟩`, `build:web:⟨FE⟩` y `test:web:⟨FE⟩`, su puerto de desarrollo
  (`4200`, `4202` y `4201`) y su Worker de assets. `shop` se materializó en su ciclo de bootstrap
  (3b) y todavía no expone capacidades de catálogo: su primera ruta es el humo del arranque. El mapa
  de rutas vigente vive en `wiki/README.md` y en `shop/README.md`.

## 2. Monorepo y TypeScript

- npm workspaces: `shared`, `backend` y cada frontend de `⟨FRONTENDS⟩`.
- TypeScript estricto en todo el monorepo.
- Una sola configuración de ESLint y una sola de Prettier, en la raíz, con pasada única.

## 3. Frontend

- Angular v22 standalone, Signals-first, zoneless.
- `NgOptimizedImage`, `httpResource` y Tailwind v4.
- Plantillas en archivos `.html` separados; nunca inline.
- `frontend` es la SPA privada; `shop` es la SPA pública del catálogo, pensada para enlazarse y para
  indexarse; `wiki` es la SPA del proyecto, con su propio mapa de rutas y su propio alcance.
  Cualquier crecimiento se declara en el resumen funcional y, en `wiki` y `shop`, en el `README.md`
  de cada frontend cuando su ciclo se abra.
- La URL base del backend se compila por entorno; el navegador no lee secretos en runtime.
- Un Worker de Cloudflare por frontend, solo de assets: `mudanzapp` (`frontend`), `mudanzapp-shop`
  (`shop`) y `mudanzapp-wiki` (`wiki`), cada uno con su `wrangler.jsonc` dentro del workspace.

## 4. Backend

- Node.js + TypeScript (ESM) con Express.
- El arranque es el único lugar que posee el ciclo de vida y el reloj.
- La lógica de dominio no conoce HTTP, base de datos, reloj ni red.

## 5. Datos

- Postgres (Neon) con SQL crudo parametrizado vía `pg`.
- Prohibido cualquier ORM o query builder que oculte el SQL.
- Migraciones solo hacia adelante e idempotentes: `IF NOT EXISTS` cuando el DDL lo permite; si no,
  una forma idempotente equivalente, sin `DROP` y sin tabla de seguimiento (nota E5 en
  `.guidelines/04` §3). La ruta automática no destruye; la contracción vive en `backend/sql/contract/`,
  versionada y aplicada a mano, y las bases `_test` y `_branch` son sandboxes desechables (nota E6).
- La experimentación vive en una sola dev branch estable, local y remota; la rama principal se
  protege.

## 6. Configuración

- Prohibido `dotenv`: las variables se leen de `process.env` con el soporte nativo de Node.
- El servidor lee el entorno **una sola vez**, en configuración tipada y centralizada.
- Una variable declarada pero vacía cuenta como ausente.
- El navegador recibe configuración compilada; nunca lee secretos en runtime.
- Puerto: el backend escucha en `process.env.PORT`. El default `3000` del código es el fallback de
  local y de pruebas, no una decisión de producción. En Railway el servicio **define `PORT=3000`**
  de forma explícita —no se omite para que la plataforma inyecte su puerto por defecto— y el dominio
  público apunta a ese mismo puerto.

## 7. Integraciones externas

| Integración | Variable | Default | Credenciales | Notas |
| --- | --- | --- | --- | --- |
| APP (primaria, reemplaza Wix) | `APP_MODE` | `live` | solo backend; `APP_MODE` gobierna solo las de esta integración | Live con credenciales válidas; fake determinista para tests |
| OAUTH (identidad de cuenta) | `OAUTH_MODE` | `live` | solo backend: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | `OAUTH_ISSUER` se parametriza igual que `AI_MODEL`; con `fake` emite un subject fijo para e2e |
| R2 (almacenamiento de objetos) | `R2_MODE` | `live` | solo backend: `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL` | La capacidad existe desde `capture` (3a) y la **lectura pública** es parte del modo desde `publish` (3c, decisión §26); `live` exige las cinco piezas, `fake` compone su propia base y no lee ninguna |
| AI | `AI_MODE` + `AI_MODEL` | `live` | `AI_API_KEY` en backend | El ID del modelo no se cablea |

- `live` exige credenciales válidas. `fake` es el doble determinista de pruebas mientras se
  consiguen las credenciales. Una variable vacía cuenta como ausente; solo `live` y `fake` son
  valores válidos. El default `live` se aplica solo si la capacidad existe; cualquier otro valor
  produce un error estable en la primera petición.
- Pruebas y e2e corren con `APP_MODE=fake`, `OAUTH_MODE=fake`, `R2_MODE=fake` y `AI_MODE=fake`.
- `APP_MODE` permanece abierto: no hay capacidad que lo consuma y, mientras no la haya, no se
  construye adaptador ni se exige credencial.
- Toda integración nueva sigue el mismo patrón y se añade a esta tabla.
- El modo de una integración solo se lee cuando su capacidad existe; sin capacidad no se construye
  adaptador ni se exige credencial. El default `live` aplica solo a integraciones implementadas.
- Ninguna integración imprime credenciales, payloads sensibles ni cuerpos crudos.

## 8. Testing

- Vitest para unit; Playwright para e2e.
- `globals: true` y `pool: 'threads'`; en el backend, además `fileParallelism: false`.
- Cero imports de `describe`/`it`/`expect`/`vi` desde `'vitest'`.
- Integración y e2e corren con cada integración en `fake`; ninguna prueba depende de APIs reales,
  de almacenamiento ni de un motor de IA.

## 9. Fallos

- Liveness no es readiness: `/health` no devuelve 5xx; `/health/db` devuelve 503 cuando la base no
  es usable.
- Falla ruidosamente con evidencia y sin filtrar secretos.
- El cliente ramifica por `code`, nunca por el mensaje.

## 10. Entrega

- Un ciclo a la vez, serial estricto.
- Una sola dev branch de base de datos, local y remota; la rama principal no es un sandbox.
- Commit convencional al cerrar el ciclo validado.
- Sin CI: la verificación es local y proporcional al corte.

## 11. Dueños y disparadores de revisión

| Hecho | Dueño | Fuente | Disparador de revisión |
| --- | --- | --- | --- |
| Identidad y nombres | Architect | este documento (decisión); `decisiones-tecnicas-app-mudanzapp.md` §14.3 (decisión de marca y criterio de crecimiento) | Cambio de marca, de plataforma o superficie pública nueva |
| Stack y dependencias | Architect | este documento | Nueva dependencia de runtime o integración |
| Alcance funcional | Architect con el usuario | `resumen-funcional-app-mudanzapp.md` | Cierre de ciclo o cambio de hipótesis |
| Modelo de datos | Architect / Backend | `modelo-datos-app-mudanzapp.md` | Nueva tabla o migración |
| Decisiones técnicas | Architect | `decisiones-tecnicas-app-mudanzapp.md` | Nueva dependencia o cambio de plataforma |
| Gate de verificación | Architect | `.guidelines/06-entrega-y-evidencia.md`; detalle operativo en `.roo/rules/04-verificacion.md` | Cambio de runner o de script raíz |
| Secretos y entornos | Architect | `.guidelines/04-datos-y-seguridad.md`; detalle en `.roo/rules/07-secretos.md` | Incidente, fuga o cambio de plataforma |
| Puerto del backend | Architect | este documento §6 y `decisiones-tecnicas-app-mudanzapp.md` §18 | Cambio de plataforma o de puerto |
| Códigos de error y evidencia de fallos | Backend | `decisiones-tecnicas-app-mudanzapp.md` §14.1 (puntero a `backend/src/errors.ts`) y `.guidelines/05-semantica-de-fallos.md` | Nueva capacidad o cambio de contrato |

## 12. Registro de dependencias

Toda dependencia de runtime nueva se registra aquí en el mismo commit `deps`, con fecha, motivo,
alternativa descartada y evidencia/aprobación. El bootstrap puede agrupar dependencias con el
scaffold (nota E3 en `.roo/rules/05-deps.md`).

| Dependencia | Versión | Tipo | Fecha | Motivo | Alternativa descartada | Evidencia/Aprobación |
| --- | --- | --- | --- | --- | --- | --- |
| Angular | v22 | runtime | 2026-10-19 | SPA standalone, Signals, zoneless | React, Vue | Stack §3 y decisión del usuario |
| Express | ^5.2.1 | runtime | 2026-10-19 | API HTTP mínima | Fastify, Koa | Stack §4 |
| pg | ^8.23.0 | runtime | 2026-10-19 | SQL crudo parametrizado | ORM o query builder | `.guidelines/04` y decisión 4 |
| zod | ^4.6.5 | runtime | 2026-10-19 | Validación en la frontera | Validación manual | `.guidelines/02` y decisión 13 |
| jose | ^6.2.14 | runtime | 2026-10-30 | Verificación OIDC (firma, emisor, audiencia, vigencia) del adaptador `live` de OAUTH | Verificación manual con `node:crypto` | Aprobación explícita del usuario al abrir `account-link`; decisión §21 y ciclo 1 |
| @aws-sdk/client-s3 | ^3.1161.0 | runtime | 2026-10-31 | Cliente oficial de la API compatible con S3 para el adaptador `live` de R2 (`PutObject`/`GetObject`) del ciclo 3c | Firma SigV4 a mano con `node:crypto` | Aprobación explícita del dueño al abrir `publish` (§3 de `plan-ciclo-3c`); commit `deps` propio |
| Tailwind CSS | v4 | dev | 2026-10-19 | Estilos utilitarios | CSS propio | Stack §3 |
| Vitest | ^4.0.8 | dev | 2026-10-19 | Pruebas unitarias | Jest | Stack §8 y decisión 9 |
| Playwright | ^1.63.0 | dev | 2026-10-19 | E2E | Cypress | Stack §8 y decisión 11 |

> Las versiones son las del bootstrap; se actualizan aquí cuando cambien. Una dependencia nueva
> no se considera autorizada hasta que aparezca en esta tabla.
