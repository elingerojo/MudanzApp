# Entorno verificado — MudanzApp (Fase 1)

> **Registro versionado del arranque.** §1 y §2 registran las versiones de `Man-2.1` y el veredicto
> de compatibilidad con el stack (2026-10-23); §5 acumula los hechos remotos observados en el
> bring-up. No contiene credenciales ni valores de `.env*`.
> **Fecha:** 2026-10-23 (UTC). **Última revisión:** 2026-10-25 (UTC).

## 1. Versiones observadas

| Herramienta | Versión            | Requisito                                                 | Veredicto |
| ----------- | ------------------ | --------------------------------------------------------- | --------- |
| Node.js     | `v24.15.0`         | `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` (manual `Man-2.1`) | pasa      |
| npm         | `11.12.1`          | —                                                         | pasa      |
| npx         | `11.12.1`          | —                                                         | pasa      |
| git         | `2.38.1.windows.1` | —                                                         | pasa      |

- `NODE_VERSION` para Railway y Workers Builds (`Man-3.4` y `Man-3.5`): `24.15.0`.
- No se crea `.nvmrc`: la fijación vive en `engines`.

## 2. Compatibilidad comprobada

| Comprobación                      | Evidencia                                                                                 | Veredicto |
| --------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| Soporte de `--env-file-if-exists` | `node --env-file-if-exists=.env.nonexistent -e ...` → `env-file-if-exists: ok`            | pasa      |
| Ventana de Node del stack         | `v24.15.0` dentro de `^24.15.0`                                                           | pasa      |
| Requisito de Angular v22          | `v24.15.0` dentro de `^20.19 \|\| ^22.12 \|\| >=24`; se revalida al instalar en la Fase 5 | pasa      |

## 3. Colisiones: lo que queda manual

| Superficie                             | Comprobación                                                 | Estado                                                          |
| -------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| Paquete npm                            | `npm view @mudanzapp/shared version` → `E404` (no publicado) | sin paquete; la existencia del scope u owner se confirma a mano |
| Workers `mudanzapp` y `mudanzapp-wiki` | dashboard de Cloudflare                                      | ambos desplegados; URLs observadas (ver §5)                     |
| Repositorio `MudanzApp`                | cuenta de GitHub                                             | `elingerojo/MudanzApp` (ver §5)                                 |
| Rol `mudanzapp` y las cuatro bases     | Postgres local                                               | verificado (2026-10-23)                                         |

## 4. Decisiones de la fase

- Plataforma: **Workers con assets, un Worker por frontend** (`mudanzapp`, `mudanzapp-wiki`).
- `⟨STORAGE⟩`: **no aplica**; el bootstrap no declara capacidad de archivos.
- Frontends: `frontend` y `wiki`.
- Los hechos remotos (`BACKEND_HOST`, owner de `GIT_REPO` y `COMPAT_DATE` definitivo) no se
  inventan: se completan en su sección del manual y se registran en §5.

## 5. Hechos remotos observados (2026-10-25)

Primer bring-up. Se anotan aquí porque el snapshot generado
([`workspace-params.md`](workspace-params.md)) los deja como `pending` **por diseño**: registra nombres
derivados, no hechos de plataforma. Ningún valor de esta tabla es una credencial.

| Hecho                              | Valor                                                       | Se obtuvo en        | Estado                      |
| ---------------------------------- | ----------------------------------------------------------- | ------------------- | --------------------------- |
| Owner del repositorio              | `elingerojo`                                                | manual `Man-3.1`    | observado                   |
| Repositorio                        | `elingerojo/MudanzApp`                                      | manual `Man-3.1`    | observado                   |
| `BACKEND_HOST`                     | `https://mudanzappbackend-production.up.railway.app`        | manual `Man-3.4` §5 | observado                   |
| Subdominio `workers.dev` de cuenta | `elingerojo`                                                | manual `Man-3.5`    | observado                   |
| URL del Worker `mudanzapp`         | `https://mudanzapp.elingerojo.workers.dev`                  | manual `Man-3.5`    | observado                   |
| URL del Worker `mudanzapp-wiki`    | `https://mudanzapp-wiki.elingerojo.workers.dev`             | manual `Man-3.5`    | observado (2026-10-25)      |
| `APP_BASE_URL`                     | los dos orígenes de arriba, separados por comas             | manual `Man-3.6` §1 | observado tras el redeploy  |
| Estado end-to-end de los Workers   | proceso `ok` y base `ok` en el navegador, sin error de CORS | manual `Man-3.6`    | observado en ambos orígenes |
| `COMPAT_DATE`                      | `2026-10-06`                                                | `wrangler.jsonc`    | confirmado en ambos         |
| `NODE_VERSION`                     | `24.15.0`                                                   | manual `Man-2.1` §1 | confirmado                  |

- El subdominio `workers.dev` es **uno solo por cuenta** y lo comparten todos los Workers: cambiar el
  label cambia las dos URLs, obliga a rehacer `APP_BASE_URL` y a redesplegar el backend.
- **Cierre del bring-up (2026-10-25):** los dos Workers abren desde su URL con `proceso: ok` y
  `base: ok` en el componente de estado, sin error de CORS en la consola. Con `APP_BASE_URL` ya
  completa, el estado intermedio de abajo no reaparece
  ([`decisiones-tecnicas`](../.plans/decisiones-tecnicas-app-mudanzapp.md) §19).
- **Estado intermedio registrado:** con `APP_BASE_URL` vacía o ausente el Worker sirve la shell y el
  navegador bloquea `GET /health` con «No 'Access-Control-Allow-Origin' header is present». Se
  resuelve al fijar la variable y redesplegar; el orden del manual no cambia
  ([`decisiones-tecnicas`](../.plans/decisiones-tecnicas-app-mudanzapp.md) §19).
