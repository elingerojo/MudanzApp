# Entorno verificado — MudanzApp (Fase 1)

> **Evidencia de la Fase 1.** Registra las versiones de `Man-2.1` y el veredicto de compatibilidad
> con el stack. No contiene credenciales ni valores de `.env*`.
> **Fecha:** 2026-10-23 (UTC).

## 1. Versiones observadas

| Herramienta | Versión | Requisito | Veredicto |
| --- | --- | --- | --- |
| Node.js | `v24.15.0` | `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0` (manual `Man-2.1`) | pasa |
| npm | `11.12.1` | — | pasa |
| npx | `11.12.1` | — | pasa |
| git | `2.38.1.windows.1` | — | pasa |

- `NODE_VERSION` para Railway y Workers Builds (`Man-3.4` y `Man-3.5`): `24.15.0`.
- No se crea `.nvmrc`: la fijación vive en `engines`.

## 2. Compatibilidad comprobada

| Comprobación | Evidencia | Veredicto |
| --- | --- | --- |
| Soporte de `--env-file-if-exists` | `node --env-file-if-exists=.env.nonexistent -e ...` → `env-file-if-exists: ok` | pasa |
| Ventana de Node del stack | `v24.15.0` dentro de `^24.15.0` | pasa |
| Requisito de Angular v22 | `v24.15.0` dentro de `^20.19 \|\| ^22.12 \|\| >=24`; se revalida al instalar en la Fase 5 | pasa |

## 3. Colisiones: lo que queda manual

| Superficie | Comprobación | Estado |
| --- | --- | --- |
| Paquete npm | `npm view @mudanzapp/shared version` → `E404` (no publicado) | sin paquete; la existencia del scope u owner se confirma a mano |
| Workers `mudanzapp` y `mudanzapp-wiki` | dashboard de Cloudflare | pendiente de `Man-3.5` |
| Repositorio `MudanzApp` | cuenta de GitHub | pendiente de `Man-3.1` |
| Rol `mudanzapp` y las cuatro bases | Postgres local | verificado (2026-10-23) |

## 4. Decisiones de la fase

- Plataforma: **Workers con assets, un Worker por frontend** (`mudanzapp`, `mudanzapp-wiki`).
- `⟨STORAGE⟩`: **no aplica**; el bootstrap no declara capacidad de archivos.
- Frontends: `frontend` y `wiki`.
- Los hechos remotos (`BACKEND_HOST`, owner de `GIT_REPO` y `COMPAT_DATE` definitivo) no se
  inventan: se completan en su sección del manual.
