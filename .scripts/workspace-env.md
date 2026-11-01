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

- `NODE_VERSION` para Workers Builds (`Man-3.5`): `24.15.0`. En **Railway no se define**: no es una
  variable documentada por Railway y la fijación del repo vive en `engines` (`Man-3.4` paso 3).
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

### Actualización (2026-10-31, cierre del ciclo 3c)

| Hecho                              | Valor                                                                                                                                                                           | Se obtuvo en                                                                  | Estado                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------- |
| URL del Worker `mudanzapp-shop`    | `https://mudanzapp-shop.elingerojo.workers.dev`                                                                                                                                 | `GET /` → `200`                                                               | observado               |
| Origen de `shop` en `APP_BASE_URL` | el de arriba, ya permitido                                                                                                                                                      | `OPTIONS` con `Origin` → `204` y `access-control-allow-origin`                | observado               |
| Deploy del backend                 | **automático** al empujar a `main` (Railway autodeploy)                                                                                                                         | estado `determined-manifestation - @mudanzapp/backend` en el commit `8789582` | observado               |
| Deploy de los tres frontends       | **Workers Builds**, conectado al repo en `main`, root directory `/`, build `npm run build:web:<FE>`, deploy `npx wrangler deploy -c <FE>/wrangler.jsonc`, sin build watch paths | dashboard de Cloudflare                                                       | conectado el 2026-10-31 |

- Antes de esta fecha los tres Workers **no** estaban conectados a Workers Builds: sus deployments
  venían de `npx wrangler deploy` manual, que estampa el commit y la rama del repo local. Un push a
  `main` no generaba build y el artefacto desplegado se quedaba en el commit anterior sin ninguna
  señal; el síntoma se detectó comparando el hash del bundle servido con el del build local.
- La verificación de un despliegue de frontend es **el check run del commit** (Workers Builds crea
  uno por Worker conectado) o el hash del bundle servido, no el dashboard por sí solo.
- **Cierre del bring-up (2026-10-25):** los dos Workers abren desde su URL con `proceso: ok` y
  `base: ok` en el componente de estado, sin error de CORS en la consola. Con `APP_BASE_URL` ya
  completa, el estado intermedio de abajo no reaparece
  ([`decisiones-tecnicas`](../.plans/decisiones-tecnicas-app-mudanzapp.md) §19).
- **Estado intermedio registrado:** con `APP_BASE_URL` vacía o ausente el Worker sirve la shell y el
  navegador bloquea `GET /health` con «No 'Access-Control-Allow-Origin' header is present». Se
  resuelve al fijar la variable y redesplegar; el orden del manual no cambia
  ([`decisiones-tecnicas`](../.plans/decisiones-tecnicas-app-mudanzapp.md) §19).

## 6. Hechos observados — bucket de R2 (cierre del 3c, corregido el 2026-11-01)

Se anotan aquí los **hechos de plataforma** del almacén de objetos, no las credenciales: el nombre del
bucket, la base de lectura pública y el endpoint S3 son direcciones, no secretos. `R2_ACCESS_KEY_ID` y
`R2_SECRET_ACCESS_KEY` **no** se escriben en ningún archivo versionado: viven en `backend/.env.local` y
en el dashboard de Railway (`.roo/rules/07-secretos.md`).

| Hecho                   | Valor                                                 | Se obtuvo en                                 | Estado     |
| ----------------------- | ----------------------------------------------------- | -------------------------------------------- | ---------- |
| `R2_BUCKET`             | `mudanzapp-photos`                                    | manual `Man-3.3` pasos 1–3                   | observado  |
| `R2_PUBLIC_BASE_URL`    | `https://pub-e6d03e1ff1ae462e9952586dc772de66.r2.dev` | dashboard → _Public Development URL_         | observado  |
| `R2_ENDPOINT`           | configurado (valor no anotado; ver nota)              | manual `Man-3.3` paso 3 (dashboard → S3 API) | ejercitado |
| Fecha de la observación | 2026-10-31, corregida el 2026-11-01                   | cierre del ciclo 3c y del 3c-optimizar       | observado  |

- **La base pública NO incluye el segmento del bucket.** `r2.dev` sirve `/<object_key>` y el objeto ya
  vive en el bucket, así que la variable es el **origen** de la lectura pública, sin la clave, sin el
  bucket y sin barra final; el adaptador solo compone `base + '/' + object_key`
  ([`r2-live.ts`](../backend/src/storage/r2-live.ts:72)). Es la misma regla que gobierna `R2_ENDPOINT`
  —«sin el nombre del bucket»—, porque en ambos casos el bucket ya está implicado por otro camino: en
  la API S3 viaja en `Bucket:` con firma, y en la lectura pública lo pone el propio host `r2.dev`.
- **Corrección del 2026-11-01 (medición anterior mal generalizada):** la observación del 2026-10-31 se
  hizo sobre la foto de `silla-blanca-de-plastico-f97d4e`, un objeto **antiguo cuya clave empezaba por
  `mudanzapp-photos/`**. Con el bucket dentro de la variable, esa URL respondía `200`, y de ahí se
  concluyó que el segmento pertenecía a la variable. Con las claves del ciclo 3c-optimizar
  —`eventId/itemId/<uuid>-<variant>`, sin prefijo ([`object-store.ts`](../backend/src/storage/object-store.ts:38))—
  la misma variable duplicaba el segmento y **toda** foto nueva daba `404`. Quitar el segmento de
  `R2_PUBLIC_BASE_URL` en Railway y redesplegar el backend lo corrige, sin re-subir fotos, republicar
  ni reconstruir el Worker de `shop`: la URL se recompone en cada lectura.
- Si la variable se fija **con** el segmento, la ficha pública pinta la página y la imagen queda en
  hueco, con un `404` en la consola del navegador: el contrato no falla, la URL apunta a otro objeto.
- **Verificación `live` del ciclo 3c (2026-10-31):** en Chromium sin sesión, sobre
  `https://mudanzapp-shop.elingerojo.workers.dev/silla-blanca-de-plastico-f97d4e`, la ficha responde
  `200`, el título es el del artículo, el `<img>` apunta a `…r2.dev/mudanzapp-photos/…` —la clave de
  esa foto antigua **incluía** el segmento, ver la corrección de arriba— y la imagen **decodifica**
  (`naturalWidth` 3072) con `localStorage` vacío. La foto se descarga del bucket público sin
  credencial y el backend no sirve bytes en ese camino (decisión §26).
- **Observado en `live` (2026-11-01):** con la base pública **sin** el segmento, la foto nueva se
  sirve y la imagen deja de dar `404`. La clave guardada es la del ciclo
  —`…/06dea6d5-…/e68a3392-…/f5aee5aa-…-medium`—, con el sufijo de la variante y **sin** prefijo del
  bucket, que es lo que confirma la corrección.
- **Pendiente de la evidencia `live` de §7:** leer en el dashboard de Cloudflare el peso de los tres
  objetos de una misma foto y abrir la ficha desde el teléfono en datos móviles. Hasta entonces no se
  anota un peso medido: la base solo conserva, por herencia, el de `large` en
  `app.item_photo.byte_size`.
- `R2_ENDPOINT` no se anota porque solo lo usan las credenciales del backend; su corrección está
  probada por el uso: la subida (`PutObject`) y la lectura con sesión (`GetObject`) funcionan.
- El `r2.dev` es un dominio de **desarrollo**: rate-limited, sin SLA y no recomendado para producción;
  su sustitución por un dominio propio es una variable de entorno y un redespliegue del backend, sin
  reconstruir el Worker de `shop` (`plan-ciclo-3c` §10).
- El paso 4 de `Man-3.3` (CORS del bucket) **no** se ejecuta: la subida va por el backend y la lectura
  pública es un `GET` de `<img>`, que no negocia CORS.
- Los valores se escriben en `backend/.env.local` (local) y en Railway (remoto). `.env.example` recibe
  solo los **nombres**.

### Esquema remoto (observado)

| Hecho                                         | Valor                                                                   | Se obtuvo en                       | Estado    |
| --------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------- | --------- |
| Migraciones aplicadas en `mudanzapp` remota   | `6` (`001`–`006`, con `app.item_photo_variant`)                         | `npm run db:migrate:remote`        | observado |
| Migraciones aplicadas en la dev branch remota | `5` (`001`–`005`): falta `006`, pendiente de `db:migrate:remote:branch` | `npm run db:migrate:remote:branch` | observado |
| Fecha de la observación                       | 2026-10-31; `006` en la principal el 2026-11-01                         | cierre del 3c y del 3c-optimizar   | observado |

- **Aviso de la deriva (2026-11-01):** el despliegue del ciclo 3c-optimizar salió **antes** de migrar
  la base remota, y el backend nuevo respondió `500` en `GET /events/:id/items` y en
  `PUT …/photo` hasta aplicar `006`. El síntoma en el deploy log fue `unhandled-error` —lo que imprime
  [`error-handler.ts`](../backend/src/error-handler.ts:29) para lo no controlado—, que no distingue un
  esquema atrasado de otro fallo. La migración remota es un paso **manual** del dueño (`Man-2.4`) y va
  antes —o en el mismo momento— del despliegue que la necesita, no después.

- **Superado (2026-10-31):** al cierre del 3c los seis nombres de R2 en el servicio de Railway y el
  redespliegue del backend estaban pendientes; se aplicaron en el dashboard (`Man-3.4`) y hoy la subida
  (`PutObject`) y la lectura pública funcionan. Mientras falten, `R2_MODE` cae en `live` con
  configuración incompleta y la primera petición de foto responde `r2_not_configured`.
- **Superado (2026-10-31):** el Worker de `shop` esperó a que el backend desplegado tuviera la ruta
  pública, porque `/:slug` habría llamado a un endpoint que no existía. Hoy los dos despliegues son
  independientes: la URL de la foto la emite la API y `shop` no compila orígenes de almacén.
