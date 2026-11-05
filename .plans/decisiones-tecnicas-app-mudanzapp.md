# Decisiones técnicas — MudanzApp

> **Naturaleza:** registro de decisiones de alto costo de reversión. El registro operativo de
> dependencias vive en `.plans/stack-tecnologico-app-mudanzapp.md` §12; la regla
> [`05-deps.md`](../.roo/rules/05-deps.md:1) apunta allí.
> **Dueño:** Architect. **Última revisión:** 2026-10-24. **Disparador de revisión:** nueva
> dependencia de runtime, cambio de plataforma o decisión que cueste revertir.
> **Evidencia normativa:** los lineamientos `.guidelines/00`–`07` prevalecen; las reglas son el
> detalle operativo.

## 1. Identidad

- Nombre interno fijo: `mudanzapp`.
- Nombre público configurable: `MudanzApp`.
- Fuente única del nombre público: `shared/src/brand.json` con acceso tipado en
  `shared/src/brand.ts` (§14.3).
- Inventario de superficies del nombre público: título, metadatos, manifest, copy, correos,
  legales, dominio y handles; plan de redirecciones al lanzamiento.
- Motivo: separar la estabilidad técnica de la marca; el renombrado público se presupuesta.
- Evidencia: [`01-alcance-y-momento-de-decision.md`](../.guidelines/01-alcance-y-momento-de-decision.md:19).

## 2. Dos frontends desde el inicio (superada)

- **Estado:** superada por §20, que declara tres superficies con la misma forma técnica.
- Se conserva como registro de la decisión original: `frontend` y `wiki` existían desde el inicio y
  compartían forma técnica, de modo que el contrato del monorepo quedaba simétrico.
- Evidencia: decisión del usuario y [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md)
  §1 y §3.

## 3. Integraciones y modos

- **Estado:** extendida por §21, que declara OAUTH como integración de identidad.
- Integraciones declaradas: APP (primaria, reemplaza Wix), OAUTH (identidad de cuenta, §21), R2
  (almacenamiento opcional) y AI.
- `APP_MODE`, `OAUTH_MODE`, `R2_MODE` y `AI_MODE` con `live`/`fake`, default `live`. Una variable
  vacía cuenta como ausente; solo `live` y `fake` son valores válidos; cualquier otro valor produce
  un error estable en la primera petición.
- El modo solo se lee cuando la capacidad existe; sin capacidad no se construye adaptador ni se
  exige credencial.
- `live` exige credenciales válidas; `fake` es el doble determinista de pruebas mientras se
  consiguen las credenciales.
- `APP_MODE` gobierna solo las credenciales de la integración primaria, y `OAUTH_MODE` solo las de
  OAUTH.
- `AI_MODEL` y `OAUTH_ISSUER` se parametrizan si aplica; ni el ID del modelo ni el emisor se cablean.
- Motivo: cada integración declara su propio modo y sus credenciales, sin compartirlas.
- Evidencia: [`02-verdad-y-contratos.md`](../.guidelines/02-verdad-y-contratos.md:21) y
  [`03-fronteras-y-variacion.md`](../.guidelines/03-fronteras-y-variacion.md:5).

## 4. Sin ORM ni query builder

- SQL crudo y parametrizado con `pg`.
- Motivo: el SQL es parte del contrato y de la evidencia del ciclo.
- Evidencia: [`04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md:1).

## 5. Sin `dotenv`

- Las variables se leen de `process.env`; en desarrollo se usa el soporte nativo de Node
  (`--env-file-if-exists`).
- Motivo: una sola forma de cargar entorno y ningún secreto transportado por el prompt.

## 6. Configuración leída una sola vez

- El servidor lee `process.env` una vez, en configuración tipada; el navegador recibe
  configuración compilada.
- Una variable declarada pero vacía cuenta como ausente.
- Motivo: [`03-fronteras-y-variacion.md`](../.guidelines/03-fronteras-y-variacion.md:15).

## 7. URL de pruebas derivada y comando canónico

- La URL de pruebas se deriva de `DATABASE_URL`: mismo rol, host, puerto y parámetros, con el
  sufijo `_test` en el nombre de la base (`mudanzapp` → `mudanzapp_test`).
- La dev branch se deriva con `_branch` (`mudanzapp` → `mudanzapp_branch`); su prueba se deriva
  añadiendo `_test` (`mudanzapp_branch` → `mudanzapp_branch_test`). Toda base de prueba termina en
  `_test`.
- La derivación es la **única** forma de obtener la URL. Una variable vacía cuenta como ausente.
- Comandos canónicos: `npm run test:api:db` y `npm run test:api:db:branch` (alias raíz; delegan
  en `npm run test:db -w backend`); `db:migrate`, `db:migrate:test`, `db:migrate:branch` y
  `db:migrate:branch:test` para migrar en local; `db:migrate:remote` y
  `db:migrate:remote:branch` para remoto. La conectividad usa `db:ping`, `db:ping:test`,
  `db:ping:branch`, `db:ping:branch:test`, `db:ping:remote` y `db:ping:remote:branch`. El catálogo
  completo vive en `.roo/rules/07-secretos.md`.
- Motivo: [`04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md:5) y
  [`07-secretos.md`](../.roo/rules/07-secretos.md:1).

## 8. Dev branch única y estable

- La experimentación vive en una sola dev branch de base de datos, local y remota.
- La rama principal se protege y solo recibe cambios validados.
- Motivo: [`04-datos-y-seguridad.md`](../.guidelines/04-datos-y-seguridad.md:39) y
  [`06-entrega-y-evidencia.md`](../.guidelines/06-entrega-y-evidencia.md:12).

## 9. Sin CI y con protección de rama

- No hay workflows de CI; el gate es local y proporcional al corte.
- La rama principal se protege igualmente: no es un sandbox.
- Motivo: la ausencia de CI no elimina la regla de la rama principal.

## 10. MCP sin secretos versionados

- `.roo/mcp.json` no se versiona; `.roo/mcp.example.json` sí, con nombres y placeholders no
  secretos.
- Motivo: [`07-secretos.md`](../.roo/rules/07-secretos.md:16).

## 11. Invitación como intención de futuro alcance (superada)

- **Estado:** superada por el alcance del ciclo 1 declarado en
  [`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md) §2 y §4, donde `invite`
  es capacidad en alcance y sostiene la hipótesis del corte.
- Se conserva como registro: mientras no había ciclo abierto, `invite` era solo un criterio para
  evaluar caminos de implementación y no una capacidad core comprometida.
- El bootstrap permaneció cero-features. El script canónico de invitación existe desde el ciclo 1
  en [`backend/scripts/invite.ts`](../backend/scripts/invite.ts:1) (`npm run invite`), y la marca
  «cuando exista» se retiró de `.roo/rules/07-secretos.md`.
- Motivo del cambio: la hipótesis del ciclo 1 es que un enlace de un solo uso crea sesiones
  utilizables por dispositivo, y esa hipótesis no se puede revisar sin la capacidad.
- Evidencia: `resumen-funcional-app-mudanzapp.md` §2 y §4 y decisión del usuario (auditoría `C3`).

## 12. MCP: muestra genérica y regla del workspace

- `03-mcp-sample.md` es la plantilla genérica reutilizable.
- `03-mcp.md` es la regla específica del workspace y nombra los tres servidores declarados:
  `cloudflare-docs`, `napkin-ai` y `railway`. `railway` es **solo lectura** y se consulta solo
  cuando la tarea lo pide de forma explícita.
- `.roo/mcp.example.json` es el inventario público de esos tres servidores, con nombres, URL y
  variables de entorno con placeholders no secretos; `.roo/mcp.json` no se versiona porque lleva
  credenciales.
- Motivo: separar el patrón reutilizable del inventario real sin inventar servidores.

## 13. Dueños y disparadores de revisión

| Hecho | Dueño | Fuente | Disparador de revisión |
| --- | --- | --- | --- |
| Identidad | Architect | este documento (decisión); §14.3 (decisión de marca y su criterio de crecimiento) | Cambio de marca, de plataforma o superficie pública nueva |
| Stack | Architect | `stack-tecnologico-app-mudanzapp.md` | Nueva dependencia de runtime |
| Frontends | Architect | `stack-tecnologico-app-mudanzapp.md` | Cambio de topología |
| Integraciones y modos | Architect | `stack-tecnologico-app-mudanzapp.md` | Nueva integración o credenciales |
| Alcance | Architect con el usuario | `resumen-funcional-app-mudanzapp.md` | Cierre de ciclo |
| Capacidades core | Architect con el usuario | `resumen-funcional-app-mudanzapp.md` | Nueva capacidad declarada |
| Modelo de datos | Architect / Backend | `modelo-datos-app-mudanzapp.md` | Nueva tabla o migración |
| MCP | Architect | `.roo/rules/03-mcp.md` | Nuevo servidor o credencial |
| Gate | Architect | `.guidelines/06-entrega-y-evidencia.md`; detalle en `.roo/rules/04-verificacion.md` | Cambio de runner o script |
| Secretos | Architect | `.guidelines/04-datos-y-seguridad.md`; detalle en `.roo/rules/07-secretos.md` | Incidente o fuga |
| Dependencias | Architect | `.plans/stack-tecnologico-app-mudanzapp.md` §12 | Nueva dependencia autorizada |
| Puerto del backend | Architect | este documento §18; `stack-tecnologico-app-mudanzapp.md` §6 | Cambio de plataforma o de puerto |

## 14. Pre-decisiones de bootstrap

Una pre-decisión no es una fuente normativa: declara un hecho ya decidido cuya implementación
está pendiente. Cuando el artefacto exista, la pre-decisión se reemplaza por un puntero al
artefacto. En esta revisión las tres tienen el artefacto construido: §14.1 y §14.2 pasan a puntero
y §14.3 ya se aplicó en el ciclo de `C5`. Ninguna fuente puede citar una ruta de esta sección como
si **no** existiera; la forma vigente de citarlas es el puntero al artefacto.

### 14.1 Errores de la API (`backend/src/errors.ts`)

- **Estado:** aplicada. El artefacto existe en `backend/src/errors.ts`.
- **Dueño:** Backend.
- **Evidencia normativa:** `.guidelines/05` §5 y `.roo/rules/00-stack.md` §Fallos.
- **Puntero:** `backend/src/errors.ts`. Sin payload: expone `ERROR_CATALOG`, `INTERNAL_ERROR`,
  `VALIDATION_FAILED`, `AppError` e `isAppError`, consumidos por `error-handler.ts`.
- **Contrato mínimo acordado (auditoría `C10`):** los códigos de esta sección se conservan como
  contrato mínimo del humo, no como superficie huérfana a podar. `not_found` y `validation_failed`
  ya están en el catálogo y su consumidor es la primera ruta con payload y la primera frontera
  validada por `backend/src/validation.ts`; los códigos concretos de cada capacidad se añaden al
  catálogo cuando esa capacidad los necesite.
- **Disparador de revisión:** la primera capacidad que cruce un error por la frontera HTTP.

### 14.2 DDL inicial (`backend/sql/001_init.sql`)

- **Estado:** aplicada. El artefacto existe en `backend/sql/001_init.sql`.
- **Dueño:** Architect / Backend.
- **Evidencia normativa:** `.guidelines/04` §3 y nota E5; `.plans/modelo-datos-app-mudanzapp.md` §1
  y §7.
- **Puntero:** `backend/sql/001_init.sql` contiene el marcador idempotente `CREATE SCHEMA IF NOT
  EXISTS app`, sin tablas de negocio, y coincide con `modelo-datos` §7.
- **Disparador de revisión:** la primera tabla de negocio del modelo.
- **Revisión (2026-10-30):** el disparador se cumplió. `modelo-datos` §1 declara las seis tablas del
  corte de identidad y el puntero a `001_init.sql` sigue siendo cierto, porque ese archivo solo
  conserva el marcador. Las tablas entran en un archivo nuevo, aditivo e idempotente del mismo
  directorio; el archivo aplicado no se edita (`modelo-datos` §9, regla 6).

### 14.3 Marca pública (`shared/src/brand.json` + `shared/src/brand.ts`)

- **Estado:** aplicada. Los artefactos existen: los datos en `shared/src/brand.json`, el acceso
  tipado en `shared/src/brand.ts` y la inyección en build en `.scripts/generate-brand-index.mjs`.
- **Dueño:** Architect.
- **Evidencia normativa:** `.guidelines/01` §3 y §Presupuesto de renombrado; auditoría `C5`.
- **Objetivo:** `brand.json` es la fuente única de la **identidad pública**: todo hecho visible hacia
  afuera que no varía por despliegue ni por ruta.
- **Consumo:** el nombre público no se cablea en el código. El `index.html` de cada frontend conserva
  un elemento de título vacío y `.scripts/generate-brand-index.mjs` lo escribe en el artefacto
  construido desde `brand.json`; además, la app fija el título en runtime desde la misma fuente.
  El paso corre sobre la **salida** porque el builder de Angular rechaza un `index.input` fuera de
  `src/` (`link.parentNode?.insertBefore is not a function`, medido en esta versión); en `ng serve`
  no se ejecuta y el título lo fija la app.
- **Disparador de revisión:** cambio de marca o de plataforma, y cada superficie nueva de §14.3.1.

#### 14.3.1 Criterio de crecimiento

El archivo crece **campo por campo, con el ciclo que necesita el campo** (`.guidelines/01` §1 y
`.guidelines/03` §1): no se agregan campos por anticipado. Cada campo declara superficie, etapa y qué
pasa si falta.

| Superficie (`.guidelines/01` §3) | Campo | Etapa | Consumo |
| --- | --- | --- | --- |
| Título | `publicName` — **existe** | build + runtime | artefacto `index.html` y `Title` de Angular |
| Descripción | `description` | build | `meta description` y `og:description` |
| Imagen social | `assets.ogImage` (ruta dentro del `public/` de cada frontend) | build | `og:image`, compuesta con el origen del entorno |
| Iconos | `assets.icon`, `assets.appleTouchIcon` | build | `link rel` y manifest |
| Manifest | `shortName`, `themeColor` | build | `manifest.webmanifest` generado |
| Locale | `locale` | build | `html lang` y `og:locale` |
| Razón social y contacto | `legalName`, `contactEmail` | build o backend | correos y pie de UI |
| Handles | `social.*` | build | `twitter:site` |

Reglas del crecimiento:

1. Solo hechos públicos e invariantes por despliegue y por ruta. El origen de cada Worker y la URL
   del backend viven en `environments/*`, que es su fuente.
2. Los binarios no entran: las imágenes viven en el `public/` de cada frontend (`.guidelines/07` §6)
   y `brand.json` guarda rutas.
3. Nada secreto: el archivo se compila dentro del bundle y es público por definición.
4. Si falta un campo que una superficie ya cableada necesita, el build falla con un código estable
   (`.guidelines/05` §2); nunca se emite una etiqueta vacía.
5. El copy largo de UI no entra: es producto, no identidad. Si la marca pasa a editarse desde una
   plataforma, el archivo deja de ser fuente de repo y su lectura se valida en la frontera
   (`.guidelines/02` §3).

## 15. Incidente de secretos: contraseña local en el transcript (2026-10-24)

- **Qué ocurrió:** durante la Fase 4 el contenido de `backend/.env.local` llegó al transcript con
  el valor de `DATABASE_URL` visible. El archivo está ignorado por git; el alcance del incidente es
  la credencial local, no el repositorio.
- **Protocolo aplicado:** se detuvo la ejecución, se reportó el archivo y la variable (nunca el
  valor) y se recomendó rotación (`.roo/rules/07-secretos.md`).
- **Decisión del usuario:** **no se rota**. Se acepta el riesgo porque la base es local y
  desechable; los puntos 2–4 de `Man-2.4` se ejecutaron después de esa aceptación explícita.
- **Alcance del riesgo:** rol `mudanzapp` en `localhost`; ninguna base remota usa esa credencial y
  el valor no se versiona.
- **Condición de revisión:** si esa contraseña se reutiliza en un entorno remoto (Neon, Railway u
  otro), se rota **antes** de moverla; al provisionar la base remota se genera una credencial nueva.
- **Registro:** la recomendación de rotación sigue en pie; esta sección documenta la aceptación, no
  la anula.

## 16. Sin Config as Code: el contrato de despliegue vive en el dashboard (2026-10-24)

- **Decisión:** no se versiona `railway.json` ni `railway.toml`. El contrato del backend —builder,
  build, start, healthcheck y watch paths— se captura en el dashboard de Railway y se registra en
  `Man-3.4` del manual, que es su única copia.
- **Motivo:** Railway declaró Config as Code deprecado; un **servicio nuevo no puede optar** por él
  y los archivos existentes dejarán de leerse el 2026-12-01. Como `Man-3.4` no se ha ejecutado, el
  servicio sería nuevo: el archivo no gobernaría nada y afirmar lo contrario sería un contrato falso
  ([`02-verdad-y-contratos`](../.guidelines/02-verdad-y-contratos.md:1)).
- **Alternativa descartada:** adoptar Infrastructure as Code (`.railway/railway.ts`) ahora. Es el
  reemplazo declarado, pero exige la dependencia `railway`, el CLI autenticado y llevar secretos a
  `preserve()` o a variables compartidas; se reevalúa al cerrar el bootstrap, con el servicio ya
  provisionado y `railway config pull` disponible para el diff.
- **Consecuencia aceptada:** el repo deja de probar el despliegue. Recrear el servicio pierde los
  ajustes, por eso el checklist de `Man-4` los afirma como evidencia.
- **Disparador de revisión:** cierre del bootstrap, cambio de host del backend o cualquier intento
  de reintroducir un archivo de configuración de Railway en la raíz.

## 17. Comandos de build y start: los de la raíz, no los del workspace (2026-10-24)

- **Decisión:** el despliegue usa `npm run build` y `npm run start` de la raíz, y el filtro sigue
  cubriendo `backend/**`, `shared/**`, `package.json`, `package-lock.json` y `tsconfig.base.json`. Si
  el panel autorrellena la variante por workspace, se sobrescribe.
- **Motivo:** el `build` raíz compila `shared` **antes** del backend, y el backend resuelve sus tipos
  desde `shared/dist/index.d.ts`. La variante por workspace solo ejecuta `tsc` del backend y depende
  de que el `prepare` de `shared` haya corrido durante el install con devDependencies disponibles: un
  supuesto implícito donde el repo puede escribir el orden.
- **Alternativa descartada:** estrechar los watch paths a `/backend/**`. El artefacto se construye
  con el lockfile, `shared`, `tsconfig.base.json` y el `package.json` raíz; con el filtro estrecho, un
  parche de dependencia o un cambio de tipos llegaría a producción solo cuando alguien tocara
  backend.
- **Alternativa viable en otro ciclo:** adoptar la variante por workspace y encadenar `shared` dentro
  del `build` de `backend`, de modo que el comando detectado sea verdadero sin perder el orden.
- **Consecuencia aceptada:** el dashboard muestra un override respecto a lo detectado. Es explícito y
  está en la tabla de `Man-3.4`.
- **Disparador de revisión:** que `shared` pase a exportar valores de runtime —hoy sus imports son
  solo de tipo— o que aparezca un segundo servicio de Railway en el mismo repositorio.

## 18. Puerto del backend: `PORT=3000` en Railway (2026-10-24)

- **Decisión:** el servicio de Railway **define `PORT=3000`** como variable de servicio. La variable
  no se omite para que la plataforma inyecte su puerto por defecto. El dominio público apunta al
  target port `3000` y el healthcheck `/health` se evalúa contra ese puerto.
- **Motivo:** una sola fuente por hecho. El repo ya declara `3000` en
  [`backend/src/config.ts`](../backend/src/config.ts:12), en
  [`frontend/proxy.conf.json`](../frontend/proxy.conf.json:1) y en
  [`e2e/support/harness.ts`](../e2e/support/harness.ts:27). Dejar que producción escuche en `8080`
  convierte ese `3000` en un valor verdadero solo en local y obliga a cada documento a arrastrar la
  excepción. El puerto de producción es un hecho de la plataforma: se declara donde vive.
- **Alternativa descartada — subir el default del código a `8080`:** no cambia nada en producción
  (la variable manda), rompe el proxy y el arnés, y traslada la incoherencia al repo entero en vez de
  eliminarla.
- **Alternativa descartada — `PORT=3000` en línea dentro del Start Command:** esconde el hecho en una
  cadena del dashboard, donde no se inspecciona ni se compara con la tabla de `Man-3.4`.
- **Alternativa descartada — `railway.json` o `railway.toml`:** la decisión 16 ya excluye Config as
  Code; un puerto no justifica reintroducirlo.
- **Alternativa descartada — fijar solo el target port del dominio:** el dominio enruta hacia un
  puerto interno. Si el proceso escucha en otro, el servicio queda inaccesible. El target port sigue
  al listener; no lo define.
- **Consecuencia aceptada:** el dashboard lleva un valor explícito donde la plataforma inyectaba uno
  por defecto. Es visible, se verifica en `Man-3.4` y no exige cambiar código: el listener ya lee
  `process.env.PORT` en configuración tipada.
- **Disparador de revisión:** cambio de plataforma de despliegue, cambio del puerto acordado o un
  segundo servicio de Railway en el mismo repositorio que necesite otro puerto.

## 19. CORS en producción: `APP_BASE_URL` después de los Workers, no antes (2026-10-25)

- **Decisión:** `APP_BASE_URL` se completa con los orígenes de **todos** los Workers y el backend se
  redespliega **después** del primer deploy de cada uno. Mientras la variable esté vacía o ausente, el
  Worker publica la shell y el navegador bloquea `GET /health`: es el estado intermedio esperado del
  bring-up, no un defecto del código ni del despliegue.
- **Motivo:** la allowlist se construye **al arrancar**, desde la configuración tipada
  ([`config.ts`](../backend/src/config.ts:58) lee `process.env` una sola vez y
  [`parseAllowedOrigins`](../backend/src/cors.ts:18) devuelve un conjunto **vacío** para `''`). Sin
  coincidencia, [`createCors`](../backend/src/cors.ts:32) no emite `Access-Control-Allow-Origin` y el
  navegador aborta la lectura. Ausente y vacía producen el mismo conjunto vacío.
- **Evidencia (2026-10-25):** con el Worker `mudanzapp` desplegado en
  `https://mudanzapp.elingerojo.workers.dev`, el shell renderizaba y `GET /health` fallaba con «No
  'Access-Control-Allow-Origin' header is present on the requested resource». Un `curl` **sin**
  `Origin` devolvía `200` con `status: ok`: backend y base sanos, allowlist vacía. Tras fijar
  `APP_BASE_URL` con los dos orígenes y redesplegar, el estado end-to-end quedó en verde.
- **Cierre de los dos orígenes (2026-10-25):** el Worker `mudanzapp-wiki` se confirmó en su propia
  URL con `proceso: ok` y `base: ok` en el componente de estado y sin error de CORS en la consola.
  El cierre cubre ambos orígenes y el estado intermedio no reaparece con la allowlist completa. El
  registro versionado del hecho vive en
  [`workspace-env.md`](../.scripts/workspace-env.md:44) §5.
- **Diagnóstico:** ese mensaje significa «el origen no está en la allowlist», no «el backend está
  caído». La comparación es exacta sobre esquema y host: una barra final, `http` en lugar de `https`
  o un espacio tras la coma rompen la coincidencia. Un `Vary: Origin` presente confirma que la rama de
  coincidencia se tomó.
- **Alternativa descartada — `Access-Control-Allow-Origin: *`:** anula la allowlist por frontend que
  la decisión de CORS aditiva ya fija y deja de ser válida en cuanto haya credenciales o cookies.
- **Alternativa descartada — completar `APP_BASE_URL` tras el primer Worker y volver a completarla
  tras el segundo:** exige dos redeploys del backend y deja un estado a medias entre ambos, sin
  ganancia: la comprobación end-to-end solo es concluyente con los orígenes definitivos.
- **Alternativa descartada — reordenar `Man-3.5` y `Man-3.6`:** `APP_BASE_URL` depende de las URLs que
  **produce** `Man-3.5`; invertirlos crea una dependencia circular. Faltaba declarar el síntoma, no
  cambiar el orden.
- **Alternativa descartada — leer `process.env` en el middleware o cablear el origen:** la
  configuración se lee una sola vez (decisión 6) y el middleware no conoce el entorno.
- **Consecuencia aceptada:** el bring-up tiene un punto donde la app «se ve» pero no «responde». Se
  verifica en dos momentos, shell en `Man-3.5` y estado en `Man-3.6`; la tabla de verificación de la
  Fase 8 describe el estado final, no el de ese punto intermedio.
- **Disparador de revisión:** dominio propio para un frontend, un tercer frontend, o CORS con
  credenciales (donde `*` deja de ser una alternativa discutible).
- **Revisión (2026-10-30):** el tercer frontend ya está declarado como superficie planificada (§20)
  sin artefacto. El disparador se cumple cuando `shop` se materialice: su origen entra en
  `APP_BASE_URL` y en el mapa de frontends del arnés, y el backend se redespliega después de su
  primer deploy.
- **Revisión (ciclo 3b):** `shop` se materializó. Su origen local entra en la allowlist del arnés por
  `FRONTENDS` (`http://localhost:4202`) y su origen remoto lo añade `Man-3.6` con el redespliegue del
  backend. La lista de frontends y la allowlist siguen teniendo una sola fuente: el arnés.

## 20. Tres superficies: `frontend` privada, `shop` pública e `wiki` como dossier (2026-10-30)

- **Decisión:** la aplicación tiene tres superficies con audiencias distintas y forma técnica
  compartida: `frontend` es la superficie privada del administrador y los co-dispositivos de cada
  evento; `shop` es la superficie pública del catálogo por enlace, indexable; `wiki` es el dossier
  técnico del proyecto,
  escrito para colaboradores externos. No es una sola SPA con modos.
- **Estado por superficie:** las tres existen en el monorepo. `frontend` y `wiki` desde el arranque;
  `shop` desde el ciclo 3b, con workspace, scripts `dev:web:shop`, `build:web:shop` y
  `test:web:shop`, puerto de desarrollo `4202` y Worker `mudanzapp-shop`. Su primera ruta es el humo
  del arranque: todavía no expone capacidades de catálogo.
- **Motivo:** las tres audiencias no comparten forma de acceso ni régimen de indexación. Mezclar
  catálogo público con área privada obliga a cada ruta a declarar su autorización, y un dossier
  técnico dentro de la app privada no lo puede leer nadie de fuera.
- **Alternativa descartada — una sola SPA con guardas por ruta:** el único artefacto publicado
  seguiría siendo el privado, así que el catálogo no sería indexable ni compartible sin exponer el
  área de trabajo, y el dossier quedaría inalcanzable.
- **Alternativa descartada — declarar `shop` cuando exista:** deja al resumen funcional describiendo
  una topología que el stack ya contradice; el estado se corrige con una nota, no con silencio.
- **Supera a:** §2.
- **Consecuencia aceptada (cerrada en 3b):** entre §20 y el ciclo 3b el stack declaró una superficie
  sin artefacto; la nota de estado por superficie se retiró al crear el workspace.
- **Disparador de revisión:** aparición de una cuarta superficie. La creación del workspace `shop` se
  cumplió en el ciclo 3b y ya no es un disparador pendiente.

## 21. OAUTH como integración declarada de identidad (2026-10-30)

- **Decisión:** la identidad de cuenta es una integración declarada con `OAUTH_MODE` `live`/`fake`,
  default `live`, credenciales solo en backend (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`) y emisor
  parametrizado en `OAUTH_ISSUER`, igual que `AI_MODEL`: el emisor no se cablea. Los tokens se
  verifican en la frontera HTTP.
- **Estado:** implementada en el ciclo 1. El adaptador vive en
  [`backend/src/identity/oauth.ts`](../backend/src/identity/oauth.ts:1) con los modos `fake` y
  `live`; `live` verifica firma, emisor, audiencia y vigencia contra el JWKS del emisor con `jose`
  (stack §12). El modo se lee solo porque la capacidad existe.
- **Motivo:** la cuenta es el segundo factor del acceso y no cabe en `APP_MODE`, que gobierna solo
  las credenciales de la integración primaria.
- **Alternativa descartada — reutilizar `APP_MODE`:** acopla dos ciclos de credenciales distintos y
  rompe la regla de que cada modo gobierna solo su integración.
- **Alternativa descartada — cablear emisor y flujo:** impide probar con un doble y obliga a
  reescribir la frontera ante cualquier cambio de proveedor.
- **Consecuencia aceptada (aplicada):** el arnés e2e compone `OAUTH_MODE=fake` en `backendEnv()`
  ([`harness.ts`](../e2e/support/harness.ts:83)), junto con un `ADMIN_TOKEN` de pruebas, y la spec
  de identidad lo ejerce sobre la base de la dev branch.
- **Extiende a:** §3.
- **Disparador de revisión:** cambio de proveedor o de flujo de identidad.

## 22. La cuenta OAuth es el factor de identidad; la invitación no lo es (2026-10-30, revisada el mismo día)

- **Decisión:** la identidad la aporta solo una cuenta externa verificada en la frontera (§21). La
  invitación no identifica a nadie: autoriza el acceso a un evento y, desde §30, admite sesiones de
  evento **sin sujeto**. La sesión es un token opaco por dispositivo, guardado como hash, con alcance
  `app` o `shop`; no hay cookies ni JWT.
- **Motivo:** un enlace reenviado no dice quién lo porta y una cuenta sola no dice a qué evento
  pertenece. Separar los dos hechos deja que el primero sea barato y opcional y el segundo sea el que
  sostiene la continuidad entre dispositivos.
- **Alternativa descartada — contraseña propia:** añade recuperación, rotación y almacenamiento de
  credenciales a un producto que solo necesita saber quién entra a un evento.
- **Alternativa descartada — JWT revocable:** un token autocontenido no se puede revocar por
  dispositivo sin una lista negra, que es `app.session` con otro nombre.
- **Consecuencia aceptada:** documentar no exige cuenta; recuperar el acceso en otro navegador sí
  exige la cuenta. Ese paso y su costo se fijan en §30.
- **Consecuencia aceptada (ciclo 4d):** el alcance `shop` deja de ser una declaración sin escritor:
  `POST /auth/shop/sessions` emite la sesión del visitante y `GET /auth/shop/session` la lee. Es la
  **misma** cuenta OAuth, con otra sesión y otro alcance (decisión §43).
- **Consecuencia aceptada:** un token de sesión **nunca** viaja en una URL. Un token que tiene que ir
  en un enlace es de un solo uso y de vida corta; el de sesión, revocable y de vida larga, se queda en
  `Authorization: Bearer` (§27).
- **Artefactos:** regla pura en [`backend/src/domain/account.ts`](../backend/src/domain/account.ts:1);
  canje, reclamo y sesión por dispositivo en
  [`backend/src/routes/auth-router.ts`](../backend/src/routes/auth-router.ts:1); tablas en
  [`backend/sql/002_identity.sql`](../backend/sql/002_identity.sql:1).
- **Completa a:** §21. **Revisada por:** §30.
- **Disparador de revisión:** adopción de dominio propio o de passkey.

## 23. La regla 4/11/21 es función pura del núcleo (2026-10-30)

- **Decisión:** la regla es una función pura: invitación a los 4 artículos, recordatorio a los 11 y
  obligación de decidir a los 21. El disparador es la captura del artículo 21 y no exige que exista
  un borrador de ficha.
- **Motivo:** una función pura se prueba con unit sin base, sin reloj propio y sin HTTP, que es la
  evidencia que el ciclo puede pagar; además, el umbral se discute sin tocar la tabla.
- **Alternativa descartada — estado persistido del recordatorio:** duplica la verdad del conteo y
  obliga a migrar cada vez que cambian los umbrales.
- **Alcance del 21:** el umbral obliga a **decidir**, no a identificarse. Que documentar sin cuenta se
  corte en el artículo 21 es un hecho distinto y todavía pendiente
  ([`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md) §6).
- **Consecuencia aceptada:** el conteo es derivado. Si su costo crece, se resuelve con un índice
  antes que con una columna.
- **Disparador de revisión:** cambio de umbrales o aparición de un tercer factor.

## 24. Enlace público legible e indexable; la autorización vive en la escritura (2026-10-30)

- **Decisión:** la superficie pública usa URLs legibles e indexables por artículo. La autorización
  se ejerce en la escritura, nunca en la URL ni en la ruta, y la base no guarda datos personales de
  visitantes.
- **Motivo:** el enlace se comparte por WhatsApp y lo lee gente sin sesión. Esconder el régimen de
  acceso en la ruta rompe la indexación y crea una falsa sensación de control.
- **Alternativa descartada — rutas con token por artículo:** no se pueden indexar ni recordar, y el
  token acaba siendo la credencial de lectura.
- **Consecuencia aceptada:** cualquiera con el enlace lee el artículo; por eso la base no tiene
  campos de nombre, teléfono, correo ni dirección del visitante
  ([`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md) §5).
- **Disparador de revisión:** aparición de un dato personal necesario.

## 25. El apartado es un bloqueo de 15 minutos sin fila (2026-10-30)

- **Decisión:** apartar es un bloqueo de 15 minutos por visitante con cuenta, con vencimiento
  perezoso y sin fila propia. `Vendido` lo produce un acto del vendedor en cualquier estado.
- **Motivo:** un bloqueo con vencimiento perezoso no necesita proceso de limpieza ni escritura
  periódica; una fila solo guardaría un instante que el estado del artículo ya guarda.
- **Alternativa descartada — fila `reservation` con proceso de expiración:** añade escritura
  periódica y un estado que hay que reconciliar con el del artículo.
- **Consecuencia aceptada:** el vendedor manda sobre el bloqueo. Sostener un apartado más allá del
  vencimiento exige revisar esta decisión, no añadir una fila a escondidas.
- **Disparador de revisión:** necesidad de sostener un apartado más allá del vencimiento.

## 26. La lectura pública de fotos forma parte de `R2_MODE` (2026-10-30)

- **Decisión:** la lectura pública de las fotos de artículo forma parte de `R2_MODE`, y `R2_MODE`
  deja de ser opcional en cuanto existe la foto del artículo.
- **Motivo:** la foto se sirve a visitantes sin sesión. Si la lectura pública fuera un camino
  aparte, `fake` no podría sustituirla y media app dependería de una API real en pruebas.
- **Alternativa descartada — servir las fotos desde el backend:** mete ancho de banda, caché y
  autorización propias en el camino crítico de una app que no las necesita.
- **Consecuencia aceptada:** el modo de almacenamiento condiciona la página pública; su política de
  retención se revisa con él ([`resumen-funcional-app-mudanzapp.md`](resumen-funcional-app-mudanzapp.md)
  §6).
- **Revisión fechada (2026-10-31, ciclo 3c):** la lectura pública **se ejerce** en `publish`. La URL
  de la foto la emite el backend desde `R2_PUBLIC_BASE_URL` y el navegador la descarga del almacén,
  sin pasar por el backend ni por el bundle; el adaptador `live` implementa la operación detrás de
  `ObjectStore.publicUrl`, de modo que `fake` sustituye también la URL. La base pública es `r2.dev`
  como valor **temporal** —rate-limited, sin SLA y no recomendada para producción— y la retención
  aprobada es «la foto vive mientras exista el `listing`», con barrido **manual** de objetos
  huérfanos. Ver §31.
- **Verificado en vivo (2026-10-31; corregido el 2026-11-01):** la foto real publicada se abre en
  Chromium sin sesión. La base pública de esta cuenta es `https://pub-<hash>.r2.dev`, **sin** el
  segmento del bucket: `r2.dev` sirve `/<object_key>` y la clave ya identifica el bucket. La medición
  del 2026-10-31 que pareció demostrar lo contrario se hizo sobre un objeto antiguo cuya **clave**
  empezaba por `mudanzapp-photos/`, de modo que poner el bucket en la variable duplicaba el segmento
  en las fotos nuevas y las dejaba en `404`. Regla vigente: `R2_PUBLIC_BASE_URL` es el origen de la
  URL pública, sin la clave, sin el bucket y sin barra final; el adaptador solo añade `/<object_key>`.
  Verla como línea de base en el registro de entorno
  ([`workspace-env.md`](../.scripts/workspace-env.md:92)).
- **Disparador de revisión:** cambio de proveedor de almacenamiento o de retención; dominio propio o
  primer tráfico real para sustituir `r2.dev`.

## 27. Riesgo de XSS en `localStorage` aceptado con mitigación (2026-10-30)

- **Decisión:** el token de sesión vive en `localStorage`. El riesgo se acepta con tres
  mitigaciones: CSP estricta en las tres superficies, ningún script de terceros y sesiones
  revocables por dispositivo.
- **Motivo:** sin cookies ni dominio propio, `localStorage` es el único sitio que sobrevive a la
  recarga sin acoplar la sesión al dominio; las tres mitigaciones se pueden verificar hoy.
- **Alternativa descartada — cookie `HttpOnly` puesta por el backend:** exige CORS con credenciales
  y un dominio propio para no romper la allowlist por origen (§19).
- **Consecuencia aceptada:** un XSS en cualquier superficie compromete la sesión de ese dispositivo;
  la revocación por dispositivo acota el daño a la sesión afectada.
- **Disparador de revisión:** incidente o adopción de dominio propio con cookies.

## 28. Metadatos del sitio en build; tarjeta por artículo aplazada (2026-10-30)

- **Decisión:** los metadatos del sitio se emiten en build desde `shared/src/brand.json` y el
  `index.html` construido de cada frontend. La tarjeta de vista previa por artículo queda aplazada y,
  si hace falta, se resuelve con inyección en el Worker y caché con invalidación. El SSR de Angular
  queda descartado.
- **Motivo:** el enlace que hoy se comparte funciona sin tarjeta propia. Añadir inyección por ruta
  multiplica el contrato del Worker antes de saber si la tarjeta cambia una venta.
- **Alternativa descartada — SSR de Angular:** convierte cada frontend en un proceso con estado para
  resolver un problema que hoy es de metadatos y de caché.
- **Consecuencia aceptada:** al compartir un artículo, la vista previa es la del sitio y no la del
  artículo, hasta tener evidencia de que la tarjeta afecta la venta.
- **Disparador de revisión:** evidencia de que la tarjeta por artículo afecta la venta.

## 29. Passkey diferida por el RP ID (2026-10-30)

- **Decisión:** passkey queda diferida. La credencial está atada al RP ID y `workers.dev` no permite
  compartirla entre subdominios.
- **Motivo:** sin dominio propio, cada superficie sería un RP distinto y la credencial no serviría
  entre ellas; adoptarla hoy obliga a rehacerla al mudar de dominio.
- **Alternativa descartada — adoptarla con un RP provisional:** obliga a re-registrar todas las
  credenciales al adoptar el dominio definitivo, con el soporte que eso implica.
- **Consecuencia aceptada:** el segundo factor sigue siendo la cuenta OAuth (§22).
- **Disparador de revisión:** existencia de dominio propio.

## 30. Invitación acotada y reclamo aditivo (2026-10-30, revisada el mismo día)

- **Decisión:** el enlace de invitación dura **72 horas desde su emisión** y admite **cinco canjes**.
  Cada canje emite una **sesión de evento**: la misma forma que la de cuenta, sin sujeto (`user_id`
  nulo y `event_id` no nulo). El invitado documenta sin cuenta. Cualquier sesión del evento —de
  evento o de cuenta— puede emitir más invitaciones para ese evento. Reclamar con una cuenta OAuth es
  **aditivo**: crea o vincula el sujeto, lo añade como miembro con `invited_by` igual al dueño del
  evento y emite una sesión de cuenta. **No** revoca otras sesiones, **no** cierra invitaciones y
  **no** limita a ningún co-dispositivo.
- **Motivo:** el primer artículo no debe pagar una cuenta, pero sin sujeto nada fuera del navegador
  puede demostrar "es la misma persona": el enlace sería la única llave. Acotarlo en tiempo y en
  canjes deja un hueco medido, y la cuenta compra la recuperación en otro dispositivo sin convertir la
  autenticación en una puerta que frene a los co-dispositivos que ya están trabajando.
- **Alternativa descartada — el reclamo cierra el enlace y revoca las demás sesiones de evento
  (primera versión de esta decisión):** funciona con un solo invitado, pero en cuanto hay varios
  co-dispositivos el primero que se autentica expulsa a los demás y el trabajo en paralelo —la
  hipótesis del ciclo 2— se vuelve imposible.
- **Alternativa descartada — identidad obligatoria desde el primer artículo:** es la rama más segura,
  pero cobra el inicio de sesión antes del efecto que el ciclo 3 quiere medir.
- **Alternativa descartada — documentar sin cuenta hasta el artículo 21 y nada más:** deja el enlace
  como único camino de regreso y obliga a que sea permanente; reescribe la hipótesis del ciclo 1 y
  retrasa `account-link` sin resolver la recuperación.
- **Alternativa descartada — el token de sesión en cada mensaje (`?token=`):** la URL acaba siendo la
  credencial: viaja al historial, a los logs del proxy, al `Referer` y a la vista previa del chat
  (§22 y §24).
- **Alternativa descartada — preguntas de seguridad:** las respuestas de alta certeza son justo los
  datos personales que el modelo prohíbe (§24), y las de baja certeza se leen en el propio evento.
- **Alternativa descartada — reconocimiento de una foto con IA:** la foto del artículo es pública por
  diseño (§24), así que una foto de la pantalla la satisface; además convierte `AI_MODE` en
  dependencia de seguridad y un doble `fake` no puede demostrar un match.
- **Consecuencia aceptada:** lo que no se reclamó antes de que el enlace se agote se pierde si además
  el navegador borró la sesión. El hueco es conocido y acotado a 72 horas; el cliente debe ofrecer el
  reclamo antes de que el enlace muera.
- **Consecuencia aceptada:** la invitación deja de cerrarse sola. Vive sus 72 horas y sus cinco
  canjes aunque exista una cuenta, y cualquier sesión puede emitir más: el perímetro del evento es
  quien tenga el enlace o una sesión. Su disparador de revisión es un incidente con un enlace
  reenviado.
- **Consecuencia aceptada:** desaparece el apagado global en un acto. El administrador conserva la
  revocación por dispositivo y no hay endpoint para revocar un enlace; `app.invitation.revoked_at`
  queda sin escritor.
- **Consecuencia aceptada:** las sesiones no caducan; las 72 horas limitan adquirir una sesión, no
  conservarla.
- **Consecuencia aceptada:** pueden coexistir varias cuentas en un evento y ninguna se puede quitar;
  quitar acceso es revocar sesiones.
- **Consecuencia aceptada:** `claimed_at` queda sin escritor; el veredicto `claimed` del núcleo se
  conserva para leer las filas que marcó la versión anterior.
- **Artefactos:** [`backend/src/domain/account.ts`](../backend/src/domain/account.ts:1),
  [`backend/src/routes/auth-router.ts`](../backend/src/routes/auth-router.ts:1) y
  [`backend/sql/003_redeemable_invitation.sql`](../backend/sql/003_redeemable_invitation.sql:1).
- **Revisa a:** §22 y §23. **Revisada por:** el corte del ciclo 2 (`invite-device`).
- **Disparador de revisión:** aparición de un dato personal, incidente con un enlace reenviado, o el
  corte que fije el umbral de identidad del artículo 21.

## 31. Publicar: URL emitida por el backend, `slug` derivado y foto obligatoria (2026-10-31)

- **Decisión:** publicar un artículo escribe una fila en `app.listing` con un `slug` **derivado** del
  título más seis caracteres del `itemId`, exige foto y devuelve `/<slug>`. La URL pública de la foto
  la compone el **backend** desde `R2_PUBLIC_BASE_URL` y viaja en el contrato (`photo.url`); ningún
  frontend compone orígenes de almacén. La clave del objeto conserva `eventId/itemId/uuid`.
- **Motivo:** el enlace se comparte por WhatsApp y se abre sin sesión, así que la página no puede
  depender de nada que el visitante no tenga. Una sola fuente por hecho —el backend— evita que
  `shop` compile la base pública y que un cambio de base obligue a reconstruir el Worker. El `slug`
  derivado da una URL legible sin abrir un editor que este ciclo no necesita.
- **Alternativa descartada — `slug` editable:** añade una ruta, una validación de colisiones y un
  formulario para un hecho que todavía no se corrige a mano.
- **Alternativa descartada — publicar sin foto y añadirla después:** la hipótesis del ciclo es la foto
  compartida; publicar sin ella no la responde. Un artículo sin foto responde
  `listing_photo_required` (409).
- **Alternativa descartada — servir la foto desde el backend:** contradice §26 (ancho de banda, caché
  y autorización propios en el camino crítico).
- **Consecuencia aceptada:** un cambio de título no cambia la URL publicada; si dos títulos son
  idénticos, el sufijo del `itemId` desempata. No hay ruta para despublicar ni para cambiar el
  `slug`: la corrección es una ruta nueva, no una migración.
- **Consecuencia aceptada:** la URL de la imagen revela identificadores internos del evento y del
  artículo. Se acepta porque no hay dato personal (§24) y porque la dirección que se comparte es la
  página, no la imagen.
- **Consecuencia aceptada:** la foto vive mientras exista el `listing`; borrar el artículo borra sus
  filas pero **no** los bytes del bucket. El barrido de huérfanos es manual y hoy no tiene script.
- **Consecuencia aceptada (operación, 2026-10-31; corregida el 2026-11-01):** `R2_PUBLIC_BASE_URL` es
  el **origen** de la lectura pública —`https://pub-<hash>.r2.dev`—, **sin** el segmento del bucket,
  sin la clave y sin barra final, porque `r2.dev` sirve `/<object_key>` y la clave ya vive en el
  bucket. Es una variable distinta de `R2_BUCKET` porque hablan protocolos distintos: el bucket viaja
  en `Bucket:` de la API S3, con firma, y la lectura pública es otro host sin credenciales. Añadir el
  bucket a la variable duplica el segmento y deja la imagen en `404` —la ficha se pinta igual—, y un
  dominio propio la sustituye sin tocar el código ni reconstruir `shop`.
- **Artefactos:** [`backend/sql/005_listing.sql`](../backend/sql/005_listing.sql:1),
  [`backend/src/domain/listing.ts`](../backend/src/domain/listing.ts:1),
  [`backend/src/routes/listings-router.ts`](../backend/src/routes/listings-router.ts:1) y
  [`backend/src/storage/r2-live.ts`](../backend/src/storage/r2-live.ts:1).
- **Revisa a:** §26. **Revisada por:** el corte del ciclo 3c (`publish`).
- **Disparador de revisión:** primer artículo publicado por error, necesidad de `slug` editable o
  estable entre cambios de título, y costo de almacenamiento visible.

## 33. La foto se optimiza en el dispositivo, se guarda en tres tamaños y el peso no se persiste (2026-10-31)

- **Decisión:** la foto de un artículo se **decodifica y se recomprime en el dispositivo** antes de
  cualquier petición, y se guarda en tres tamaños estándar —`thumb` 320 px, `medium` 768 px y `large`
  1440 px de lado mayor, todos con la proporción original, sin recorte y sin ampliar—. La codificación
  arranca en calidad 0.8 y **solo baja la calidad** hasta 0.5 si el resultado rebasa el objetivo de
  400 KB; la escala no cambia nunca para cumplir el peso. Los tres tamaños viven en
  `ITEM_PHOTO_SIZES` e `ITEM_PHOTO_ENCODING` (`shared/src/item.ts`), son la misma fuente para el
  navegador y para la frontera, y **ninguna regla de peso ni de tamaño vive en la base de datos**: el
  peso no entra al modelo nuevo y `byte_size` sobrevive en `app.item_photo` solo como herencia que
  describe el tamaño `large`.
- **Motivo:** el enlace se comparte por WhatsApp y se abre en datos móviles; una foto de cámara de
  varios megabytes no se puede abrir así. Optimizar en el origen es lo único que cumple las dos
  condiciones a la vez: la original **nunca viaja** —ni al backend ni a la IA de 3d— y lo guardado
  persigue un objetivo de peso sin imponer un recorte al encuadre que el usuario vio.
- **Alternativa descartada — redimensionar en el servidor con `sharp`:** es dependencia de runtime
  nueva y, además, obliga a que la original viaje primero, que es exactamente lo que la hipótesis
  prohíbe. `canvas` y `toBlob` son nativos: cero dependencias y cero bytes de original en la red.
- **Alternativa descartada — subir la original y transformar en el CDN de imágenes:** ata el producto
  a un proveedor de transformación, exige el archivo grande en el almacén y deja el peso fuera del
  control del ciclo. Su disparador sería un catálogo con decenas de tarjetas (`srcset` responsivo y
  CDN de imágenes quedan fuera de este ciclo).
- **Alternativa descartada — bajar la escala para cumplir el objetivo de peso:** cambiaría el encuadre
  por una razón invisible para el usuario. El tamaño lo fija la variante; el peso solo mueve la
  calidad.
- **Alternativa descartada — guardar el peso en el modelo nuevo:** obliga a mantener un estado que
  nadie usa para decidir nada. Sin columna no hay nada que pueda contradecir lo que la foto pesa.
- **Consecuencia aceptada — nadie verifica el peso después de codificar:** no hay control en el borde,
  ni en la base, ni en la lectura. Si una versión futura del codificador se equivoca, entra una foto
  pesada sin que nada la detenga. Es el precio de no mantener el peso como estado.
- **Consecuencia aceptada — una foto muy ruidosa puede no llegar al objetivo:** con la calidad en el
  piso se guarda la mejor codificación obtenida, el formulario muestra su peso real y la captura
  sigue. Nada se bloquea y nada se rechaza.
- **Consecuencia aceptada — tres objetos por foto y columnas heredadas duplicadas:** el almacén crece
  en número de objetos y `app.item_photo` sigue guardando la clave, el tipo y el peso del tamaño
  `large`, que también viven en la tabla nueva. Es deuda declarada con disparador —el ciclo de GC— y
  el precio de no tocar el DDL de la tabla principal.
- **Consecuencia aceptada — ruptura del contrato de la foto:** `ItemPhoto` y `PublicListingPhoto`
  pasan de una URL a tres tamaños con URL y dimensiones, y el peso desaparece de todos los contratos.
  No hay consumidor fuera del monorepo y los tres workspaces se compilan en el gate.
- **Consecuencia aceptada — el navegador decide el codificador:** WebP primero y JPEG como respaldo
  con el mismo presupuesto de peso; `content_type` guardado dice la verdad. Si el navegador no sabe
  decodificar lo que entrega la cámara (HEIC), el optimizador falla con un mensaje explícito y no sube
  nada: fallo ruidoso, no degradación silenciosa.
- **Artefactos:** [`shared/src/item.ts`](../shared/src/item.ts:1),
  [`shared/src/listing.ts`](../shared/src/listing.ts:1),
  [`backend/sql/006_item_photo_variant.sql`](../backend/sql/006_item_photo_variant.sql:1),
  [`backend/src/domain/item.ts`](../backend/src/domain/item.ts:1),
  [`backend/src/routes/items-router.ts`](../backend/src/routes/items-router.ts:1),
  [`frontend/src/app/items/photo-optimizer.ts`](../frontend/src/app/items/photo-optimizer.ts:1) y
  [`shop/src/app/listing/listing.component.ts`](../shop/src/app/listing/listing.component.ts:1).
- **Revisa a:** §26 y §31 (la URL pública deja de ser una y pasan a ser tres, emitidas por el mismo
  `ObjectStore.publicUrl`). **Revisada por:** el corte del ciclo 3c-optimizar y, como hecho heredado,
  el arranque de 3d (el borrador de IA consume la mediana, nunca la original).
- **Disparador de revisión:** que 400 KB deje de ser suficiente para el zoom, o que aparezca un
  catálogo con decenas de tarjetas.

## 34. El borrador de la IA es efímero, se valida en la frontera y solo el humano escribe (2026-11-01)

- **Decisión:** la IA propone **solo** `title` y `note`. El borrador **no es estado**: no hay tabla, ni
  historial, ni versiones; se valida en la frontera contra `aiDraftSchema` (`shared/src/ai.ts`) y lo
  único que llega a `app.item` es lo que el humano deja escrito en el formulario y aprueba al pulsar
  `Publicar` o `Solo guardar`. La IA **nunca** decide medidas, peso, precio ni destino. El borrador se
  pide **desde el formulario de captura, antes de que el artículo exista**
  (`POST /events/:eventId/ai/drafts`, sin `itemId`), y al proveedor viajan **los bytes de la variante
  `medium`** que §33 reservó para este corte —nunca la original ni la `large`— como cuerpo binario
  crudo que el backend convierte a `inline_data`. **R2 no participa en el camino de la IA**: no hay URL
  pública, no se espera al almacén y un borrador `live` funciona con `R2_MODE=fake`. La foto sale del
  sistema hacia un tercero **segundos antes de publicarse**, y el envío lo inicia siempre una persona
  con una acción explícita.
- **Veredicto del transporte (2026-11-01, decisión del dueño en la sesión de diseño): forma B.** El
  borrador viaja con los bytes de la mediana y `inline_data`, porque así la IA no depende del almacén y
  el artículo todavía no necesita existir. El experimento anterior —una llamada en `live` sobre la URL
  pública real de un objeto (`image/webp`, `200`, 51 404 B) que devolvió un JSON válido con
  `titleLength` 27 ≤ 120 y `noteLength` 169 ≤ 500— queda como **historia**: probó la forma A, que ya no
  se usa, y deja registrado que el proveedor acepta la mediana y respeta el esquema.
- **Cierre `live` en producción (2026-11-01): confirmado por el dueño.** En el servicio, con
  `AI_MODE=live` y `R2_MODE=live`, un borrador real tomado desde el teléfono sobre una foto real se
  revisó en el formulario y se publicó: el proveedor aceptó los bytes de la mediana en `inline_data` y
  el recorrido completo funcionó. El ciclo 3d queda **cerrado**, y con él el ciclo 3. Los tiempos, el
  modelo usado, el texto del borrador y la calidad de la ficha no se registran.
- **Motivo:** la hipótesis de 3d es que «la ficha borrador de la IA se revisa en vez de escribirse»
  (`resumen-funcional` §3). Eso exige tres cosas a la vez: que el borrador no pueda convertirse en
  dato sin una persona, que su forma sea la única que el artículo admite, y que falle ruidosamente
  cuando el modelo devuelve algo que no cumple. Las tres están en la costura y en el esquema, no en el
  prompt.
- **Alternativa descartada — persistir el borrador en `app.ai_draft`:** una tabla, un estado y una
  limpieza que este corte no aprende a usar; contradice `.guidelines/06` §1. Su disparador es que el
  dueño pida recuperar un borrador tras recargar.
- **Alternativa descartada — que la IA cree el artículo y la foto:** elimina la revisión humana, que
  **es** la hipótesis, y mete un error en un artículo que se comparte por WhatsApp.
- **Alternativa descartada — la dirección pública del objeto (forma A):** el backend componía la URL y
  el proveedor descargaba la foto. Funcionaba, pero obligaba a un **título de trabajo** antes del
  borrador, a un **panel de revisión aparte con su `PATCH`** y a un almacén `live` dentro del camino de
  la IA. Su disparador de vuelta es que el cuerpo binario de hasta 5 MiB deje de ser aceptable en la
  frontera.
- **Alternativa descartada — usar el SDK oficial del proveedor:** dependencia de runtime con su commit
  `deps`. El corte cabe con `fetch` nativo y `AbortSignal.timeout`. Disparador: subida por referencia o
  streaming.
- **Consecuencia aceptada — el botón primario publica, y publicar es irreversible:** no hay despublicar
  ni `slug` editable, así que el texto que la IA propuso queda público si el humano no lo corrigió. La
  mitigación del ciclo es que los campos están delante, son editables sin temporizador y existe
  `Solo guardar` al lado de `Publicar`. Disparador: el primer artículo publicado con un texto que nadie
  revisó.
- **Consecuencia aceptada — un error publicado no se puede corregir en este ciclo:** la edición de una
  ficha ya publicada (`PATCH` de `title` y `note`) sale del corte. Disparador: la primera errata real;
  entonces vuelve en su propio corte y republicar no cambia el `slug`.
- **Consecuencia aceptada — el estado publicado se lee de la base:** `ItemSummary` gana
  `publishedSlug` con un `LEFT JOIN app.listing`, en vez de la memoria de la visita, que se perdía al
  recargar.
- **Consecuencia aceptada — coste sin control de cuota:** una llamada por clic, `maxOutputTokens`
  acotado, una sola tentativa y sin reintentos automáticos. Sin tope por evento ni por sesión en este
  ciclo; el hecho queda pendiente en `resumen-funcional` §6.
- **Consecuencia aceptada — la foto sale hacia un tercero antes de publicarse:** la política de datos
  del proveedor es del dueño y queda registrada como hecho pendiente con disparador. La mitigación del
  ciclo es que el envío lo inicia un humano, y que la foto que viaja es la mediana.
- **Consecuencia aceptada — sin observabilidad de fallos de IA:** no se registran cuerpos, prompts ni
  URL; solo códigos. Disparador: el primer «no funciona» sin evidencia.
- **Artefactos:** [`shared/src/ai.ts`](../shared/src/ai.ts:1),
  [`backend/src/ai/draft-provider.ts`](../backend/src/ai/draft-provider.ts:1),
  [`backend/src/ai/gemini-draft.ts`](../backend/src/ai/gemini-draft.ts:1),
  [`backend/src/routes/ai-router.ts`](../backend/src/routes/ai-router.ts:1),
  [`backend/src/routes/raw-body.ts`](../backend/src/routes/raw-body.ts:1),
  [`frontend/src/app/items/item-form.component.ts`](../frontend/src/app/items/item-form.component.ts:1),
  [`frontend/src/app/items/item-list.component.ts`](../frontend/src/app/items/item-list.component.ts:1) y
  [`wiki/src/app/foto-a-ficha/foto-a-ficha.component.ts`](../wiki/src/app/foto-a-ficha/foto-a-ficha.component.ts:1).
- **Revisa a:** §33, que reservó la mediana para este corte. **Deja de revisar §26:** la URL pública
  sigue siendo el hecho de la ficha pública, pero el borrador ya no la consume. **Revisada por:** el
  corte del ciclo 3d y su cierre `live` en remoto.
- **Disparador de revisión:** primera factura inesperada, cambio de política del proveedor, aparición
  de un dato personal en una foto enviada, una tanda de capturas reales en la que el borrador obligue a
  reescribir todo, o una errata publicada que no se pueda corregir.

## 35. El precio vive en el artículo, puede ser nulo y deshabilita la pulsación (2026-11-01)

- **Decisión:** el precio vive en `app.item.price_cents`, entero en la moneda del evento —`currency`
  ya existe en `app.event` (§002)—, es **nulo** por defecto y lo edita cualquier sesión del evento
  desde la página de edición de `Capturados`. Publicar **no** exige precio. Un artículo con precio
  nulo muestra «precio a consultar», su botón «Lo quiero» está **deshabilitado** y la frontera
  rechaza el intento con `price_missing` (409).
- **Motivo:** el precio es lo que convierte el catálogo en una decisión y lo que da sentido al total
  del carrito; pero exigirlo al publicar bloquea la publicación mientras el vendedor decide y reabre
  un hecho que el ciclo 3c ya había cerrado sin él.
- **Alternativa descartada — precio en `app.listing`:** parte el hecho en dos tablas y deja la ficha
  sin el dato que alimentan el catálogo, el carrito y la cotización futura.
- **Alternativa descartada — precio obligatorio al publicar:** convierte un hecho pendiente del
  vendedor en un bloqueo del corte de publicación, que ya está cerrado.
- **Consecuencia aceptada — la moneda no viaja con el precio:** se lee de `app.event.currency`, así
  que un artículo no puede tener una moneda distinta de la de su evento.
- **Consecuencia aceptada — no hay relleno de datos:** los artículos publicados antes de este corte
  quedan con precio nulo y su pulsación deshabilitada; ninguna migración escribe valores.
- **Artefactos:** `shared/src/item.ts`, `shared/src/listing.ts`,
  `backend/sql/008_item_price_and_sold.sql` —el `007` ya es `event_public_slug`—,
  `backend/src/routes/items-router.ts` y la página de edición de `frontend`.
- **Implementada por:** el corte del ciclo 4b (`item-edit`), que además convirtió el precio en parte
  de la clave de versión del índice y de la ficha. **Cerrada con revisión `live` del dueño el
  2026-11-02.**
- **Disparador de revisión:** precios en moneda distinta de la del evento, o la primera venta que
  necesite fracciones (entero a decimal).

## 36. El evento estrena slug público e inmutable al crearse (2026-11-01)

- **Decisión:** `app.event.public_slug`, derivado de las ciudades más seis caracteres del `eventId`,
  único y con el mismo patrón que el `slug` del artículo. Se emite al crear el evento, existe **antes**
  de que haya artículos y **no se reescribe**. La ruta pública es `/evento/<slug>` en `shop` y el
  contrato `GET /public/events/:publicSlug` no publica `eventId`.
- **Motivo:** el enlace del evento se comparte desde el minuto cero —el índice nace vacío— y el
  contrato público no publica identificadores internos (§24).
- **Alternativa descartada — el `eventId` en la URL:** gratis hoy y un identificador público
  permanente mañana, sin poder leerse ni dictarse por teléfono.
- **Alternativa descartada — token secreto por evento:** no es indexable y el token se convierte en la
  credencial de lectura, que es lo que §24 descartó.
- **Consecuencia aceptada — el índice de un evento vacío es público:** responde su estado vacío y no
  entra en la indexación hasta que tenga artículos publicados.
- **Evidencia `live` (2026-11-02):** el corte 4a se desplegó y el dueño lo revisó en el móvil. El
  índice de un evento recién creado abre sin sesión con su estado vacío y el enlace sigue siendo
  válido; desde la primera publicación se sirve ya renderizado y la ficha vuelve a él.
- **Revisada por:** el corte del ciclo 4a (`event-index`).
- **Disparador de revisión:** necesidad de renombrar un evento ya publicado, o de un dominio por evento.

## 37. El event-administrator se reclama con la primera autenticación (2026-11-01)

- **Decisión:** `app.event.admin_user_id` (nullable). El **primer invitado de ese evento que se
  autentica con cuenta** lo reclama; el reclamo es idempotente y no cambia después. `is_admin` también
  entra al dashboard de cualquier evento. Una sesión de co-dispositivo —sin sujeto— responde
  `forbidden`. `ADMIN_TOKEN` conserva crear eventos, invitarlos y revocar sesiones, y **no** se usa
  para las escrituras del evento.
- **Implementado (2026-11-03, corte 4c-2):** el reclamo ocurre dentro de la transacción de
  `POST /auth/claim`, con `UPDATE … WHERE admin_user_id IS NULL`; `GET /events/:eventId/dashboard`
  publica **en una sola lectura** quién administra y los co-dispositivos del evento; y
  `DELETE /events/:eventId/sessions/:sessionId` des-invita a un co-dispositivo, rechazando la sesión en
  curso.
- **Implementado (2026-11-04, corte 4c-3):** la misma lectura del panel publica los enlaces emitidos
  (sin `token_hash`), y `DELETE /events/:eventId/invitations/:invitationId` escribe `revoked_at` de
  forma idempotente. Cancelar un enlace no revoca las sesiones que ya creó: se retiran una por una,
  que es la limitación declarada. La frontera de administración vive en una sola función
  (`requireEventAdministrator`) y la comparten la lectura del panel, la des-invitación y la
  cancelación.
- **Implementado (2026-11-04, corte 4c-4):** el event-administrator retira una captura equivocada con
  `DELETE /events/:eventId/items/:itemId`. Un artículo vendido responde `409 item_sold` porque es la
  evidencia de la venta (§40). El borrado reusa la misma frontera y la cascada —foto, variantes y
  `app.listing`— la impone el DDL; la ficha pública responde `404` en la siguiente lectura.
- **Evidencia del gate local (2026-11-04):** 4c-3 y 4c-4 integrados en lineal sobre `main`; gate
  completo verde con OAuth `fake`: `test:api` (187), `test:api:db:branch` (196, con cascada y
  revocación efectivas), `test:web:frontend` (114) y `test:e2e:branch` (20, con los dos recorridos del
  panel). La revisión `live` de ambos cortes queda pendiente del dueño.
- **Evidencia `live` (2026-11-03):** el dueño reclamó un evento con su cuenta de Google desde
  `localhost` —canje, `Vincular cuenta`, vuelta a `/auth/callback`—, abrió el panel con quién administra
  y los co-dispositivos, comprobó que un co-dispositivo en otra ventana recibe el aviso en lugar del
  panel, y lo des-invitó: la fila quedó en «sin acceso» y ese dispositivo perdió el acceso. La
  migración `009` se aplicó a la base local; el destino remoto queda pendiente y va **antes** de
  integrar a `main`.
- **Motivo:** hoy `app.event.owner_user_id` es siempre el administrador de la plataforma, porque
  [`admin-router`](../backend/src/routes/admin-router.ts:58) lo fija al crear el evento. «El usuario
  del evento» no tenía campo, y el dashboard exige autenticación mientras que el co-dispositivo no
  tiene sujeto con el que identificarse (§30).
- **Alternativa descartada — reasignar `owner_user_id`:** borra el hecho de quién creó el evento.
- **Alternativa descartada — designarlo desde el dashboard del administrador de la plataforma:**
  obliga a construir ese dashboard en este ciclo, que no está declarado.
- **Consecuencia aceptada — el reclamo depende de quién abra primero el enlace:** si el enlace se
  reenvía a la persona equivocada, se corrige revocando la sesión y emitiendo una invitación nueva, no
  editando el modelo.
- **Disparador de revisión:** un evento con dos administradores, o un reclamo equivocado que no se
  pueda corregir con una revocación.

## 38. El interés de compra sustituye al apartado de 15 minutos (2026-11-01, supera a §25)

> **Superada por §44 (2026-11-04).** La fila de interés por artículo no se creó: el carrito de
> seleccionados con su solicitud guarda el hecho. Lo que sigue se conserva como registro del criterio.

- **Decisión:** el visitante **no** aparta. Pulsa «Lo quiero» y eso registra un
  `app.purchase_interest` por artículo y por visitante, con instantánea de título y precio, sin
  bloqueo, sin vencimiento y sin exclusividad. Varios visitantes pueden señalar el mismo artículo. El
  event-administrator los ve en su dashboard, decide fuera de la aplicación y **descarta** el interés;
  el comprador puede cancelarlo. Ningún estado del artículo cambia por un interés.
- **Motivo:** apartar exigía un reloj, un vencimiento perezoso y una reconciliación con el estado del
  artículo. El hecho que el vendedor necesita es «quién lo quiere», y ninguna columna del artículo lo
  guarda. **Supera a §25** porque el argumento de aquélla —una fila solo guardaría un instante que el
  artículo ya guarda— no aplica a un dato que solo la fila puede guardar.
- **Alternativa descartada — mantener el bloqueo de 15 minutos:** introduce reloj, carrera y estados
  que este producto resuelve fuera de la aplicación.
- **Alternativa descartada — un estado `reservado` en el artículo:** excluye a los demás compradores
  por una decisión que el vendedor toma fuera de la aplicación.
- **Consecuencia aceptada — «notificado» es un distintivo en el dashboard:** refresco al enfocar y
  recarga manual, sin push ni proveedor externo. Disparador: que el vendedor pida aviso real.
- **Consecuencia aceptada — el único canal con el comprador es el WhatsApp que él inicia:** la base no
  guarda teléfono, correo ni dirección del visitante (§24 y `resumen-funcional` §5). **Corrección
  (ciclo 4d):** un visitante **registrado** en la tienda sí tiene una cuenta OAuth con nombre de
  perfil; ese nombre no es un dato de contacto y no cambia la regla sobre los demás.
- **Disparador de revisión:** que el vendedor necesite sostener una exclusividad, o que dos compradores
  reclamen el mismo artículo ya vendido.

## 39. El carrito vive en una tabla y `localStorage` es solo un espejo (2026-11-01)

> **Revisada por §44 (2026-11-04).** El carrito sigue en tabla y el `PUT` sigue reemplazándolo entero;
> lo que cambia es el alcance: no hay total en este corte, la solicitud es una fila aparte con su
> instantánea y la ruta lleva el `publicSlug` del evento porque el carrito es por evento.

- **Decisión:** `app.cart` por visitante y evento, y `app.cart_item` por artículo. La verdad es la
  tabla: `GET /public/cart` la lee y `PUT /public/cart` la reemplaza entera, de forma idempotente. El
  navegador guarda una copia en `localStorage` **solo** para pintar sin esperar y la reconcilia contra
  el `GET`. El total es derivado en `shared`, nunca almacenado. **No hay caché en RAM en este ciclo.**
- **Motivo:** el carrito es un dato del comprador que debe sobrevivir al navegador y al dispositivo, y
  `localStorage` no es ni confiable ni autoritativo. La caché en RAM del referente
  (`ClaimItApp/backend/src/cache/appStore.ts`) responde a un perfil de lectura de feed, no al de un
  carrito de pocas filas.
- **Alternativa descartada — copiar el store en RAM con volcado a Neon:** añade una segunda fuente de
  verdad, acopla el servicio a una instancia y un proceso de volcado que este corte no necesita.
- **Alternativa descartada — carrito solo en el cliente:** se pierde al limpiar el navegador y no
  puede alimentar el interés ni el total en la superficie del vendedor.
- **Consecuencia aceptada — una lectura de carrito por visita con sesión:** si esa lectura domina el
  consumo de Neon, la caché entra como decisión propia con su medición, no a escondidas.
- **Disparador de revisión:** lectura de carrito que domine el consumo de Neon, o un carrito que deba
  compartirse entre dispositivos.

## 40. Vender no es borrar (2026-11-01)

- **Decisión:** `sold` es un acto del vendedor que escribe `app.listing.sold_at` y conserva el
  artículo, la foto y su URL; el índice deja de ofrecerlo y la ficha responde `Vendido`. `delete`
  retira una **captura equivocada**, solo lo ejerce el event-administrator y no es la forma de cerrar
  una venta. `sold_at` se gana en cualquier estado y no exige precio.
- **Motivo:** cerrar una venta y corregir un error son hechos distintos. El modelo de 3c ya advirtió
  que borrar deja objetos huérfanos en el almacén y que el barrido es manual
  ([`modelo-datos`](modelo-datos-app-mudanzapp.md:82)).
- **Alternativa descartada — usar `delete` para vender:** destruye la evidencia de lo que se vendió y
  deja el objeto en el bucket.
- **Alternativa descartada — `sold` con monto:** el monto no tiene consumidor en este ciclo; queda como
  hecho pendiente con disparador en `resumen-funcional` §6.
- **Consecuencia aceptada — el barrido de huérfanos se vuelve urgente:** sigue sin script y su
  disparador se adelanta al primer borrado real.
- **Consecuencia aceptada — una venta no se deshace desde la interfaz:** revertirla es un acto de base.
- **Implementada por:** el corte del ciclo 4b (`settle-sale`). El índice excluye la ficha con
  `sold_at`; la ficha conserva `200` con `X-Robots-Tag: noindex` durante treinta días y después
  responde `410 listing_gone` con el mismo `noindex`. El modelo no tiene fin de evento, así que hoy el
  único límite operativo es el de treinta días. **Cerrada con revisión `live` del dueño el
  2026-11-02.**
- **Implementado el borrado (2026-11-04, corte 4c-4):** solo el event-administrator ejerce
  `DELETE /events/:eventId/items/:itemId`; un vendido responde `409 item_sold` y no se borra. La
  cascada retira foto, variantes y `app.listing`, así que el índice deja de ofrecer la tarjeta y la
  ficha pública responde `404 not_found` sin lápida ni `410`. Los objetos del almacén quedan
  huérfanos: el barrido sigue manual y su disparador se adelanta al primer borrado real. Evidencia:
  unit de base con cascada, frontera `403`/`409` y e2e que publica, borra y comprueba el `404`; la
  revisión `live` queda pendiente del dueño.
- **Disparador de revisión:** la primera venta que haya que revertir, el primer borrado que deje
  objetos que importen, o la aparición de un fin de evento que extienda la cortesía.

## 41. El entorno de producción se inyecta al crear el contenedor (2026-11-03)

- **Decisión:** un cambio de variables en Railway no lo adopta un contenedor que ya está corriendo. La
  primera acción ante un síntoma de configuración en producción es **Restart**, que recrea el
  contenedor sin compilar; `Redeploy` compila desde el mismo commit y queda para cuando la imagen
  misma sea la sospechosa. Los valores se revisan después, no antes.
- **Motivo:** el servidor lee el entorno **una sola vez**
  ([`config.ts`](../backend/src/config.ts:97) y [`index.ts`](../backend/src/index.ts:15)) y construye
  el adaptador en ese mismo arranque; nada se recarga en caliente. Es el mismo hecho que obliga a
  reiniciar `dev:api` cuando cambia `.env.local`.
- **Evidencia (2026-11-03):** con el cliente público de Google ya compilado en el bundle de producción
  (`37ea7bc`), el canje seguía respondiendo `503 oauth_not_configured` aunque las cuatro variables del
  servicio eran correctas. Un **Restart**, sin tocar un solo valor, dejó la autenticación funcionando
  en el teléfono contra el sitio desplegado. **Cerrada con revisión `live` del dueño el 2026-11-03.**
- **Consecuencia aceptada — el fallo no deja rastro:** `oauth_not_configured` es un `AppError`
  reconocido, y el manejador solo registra lo que no reconoce, así que repetir el fallo no escribe
  ninguna línea. La evidencia se busca en el navegador y en el arranque del contenedor, no en el log
  de la petición.
- **Consecuencia aceptada — `OAUTH_MODE=fake` avisa desde 4c-3:** el arranque emite
  `OAUTH_MODE is fake` con el mismo criterio que `R2_MODE=fake` y `AI_MODE=fake` (commit `c3cb9f0`),
  así que el hueco de diagnosticabilidad que dejó este corte queda cerrado.
- **Disparador de revisión:** el primer despliegue que se quede en `fake` sin que nadie lo note, o un
  entorno servido con variables montadas fuera del contenedor.

## 42. La etiqueta del enlace es una palabra de un anillo de veinte (2026-11-04)

- **Decisión:** cada invitación nace con **una** palabra de una cola circular de 20 (`caja`, `flete`,
  `manta`, … `alfombra`), **compartida por todos los eventos**: la emisión siguiente recibe la que
  sigue y la palabra vuelve al llegar a la vigésima primera emisión del sistema. La palabra se persiste
  en `app.invitation.label` y viaja en el enlace como `?etiqueta=<palabra>`, un parámetro que el canje
  no lee.
- **Motivo:** el panel de 4c-3 publicaba tres enlaces del mismo día indistinguibles —misma fecha, mismo
  vencimiento, mismos canjes—, así que «qué enlace cancelar» no tenía respuesta. El nombre se lee en la
  fila y se dice por WhatsApp.
- **Alternativa descartada — derivar la etiqueta del `id`:** no cuesta esquema, pero no controla la
  repetición; dos emisiones contiguas pueden coincidir.
- **Alternativa descartada — anillo por evento:** evita que un evento repita antes de sus veinte
  emisiones, pero infiere el puntero de `ORDER BY created_at`, que se desvía cuando una transacción
  espera el bloqueo, y no ahorra el mecanismo.
- **Consecuencia aceptada — un evento puede repetir palabra antes de sus veinte emisiones**, si entre
  sus dos enlaces el sistema emitió veinte. La fecha con hora y la referencia corta del `id` lo
  resuelven en la fila.
- **Consecuencia aceptada — el puntero es una fila singleton** (`app.invitation_label_sequence`) y el
  bloqueo es global: toda emisión espera a la misma fila. Es deliberado: el puntero es un hecho escrito,
  no una deducción sobre timestamps, y sobrevive a un reinicio, a un `Redeploy` y a varias instancias.
- **Implementada por:** el corte `4c-fix` (`plan-ciclo-4c-fix-etiqueta-enlaces`), migración `012`.
- **Revisión `live` del dueño, 2026-11-04:** los tres enlaces de la revisión figuran con nombre en el
  panel, la emisión siguiente continuó el anillo, la cancelación por nombre dejó la fila en `cancelado`,
  el canje de ese token respondió `410` y la URL del enlace termina en `&etiqueta=<palabra>`. Con eso
  queda cerrado el hallazgo de 4c-3.
- **Disparador de revisión:** el primer evento con más de veinte enlaces donde dos se confundan, o el
  primer dueño que quiera escribir el nombre a mano.

## 43. La cuenta de la tienda es la misma cuenta OAuth con alcance `shop` (2026-11-04)

- **Decisión:** el visitante se registra con el **mismo primer acceso OAuth** del producto y recibe una
  sesión de alcance `shop`, con sujeto y sin evento. El registro no crea membresía ni reclama evento.
  El nombre visible es **opcional y posterior**: el primer acceso usa el nombre verificado por el
  proveedor —`Invitado` cuando no lo trae— y `PATCH /auth/shop/profile` permite fijarlo desde
  `/cuenta`; escribe solo la fila del sujeto que la sesión resolvió.
- **Motivo:** el alcance `shop` existía en `app.session` desde el ciclo 1 sin escritor ni lector, y el
  interés de compra (4e) necesita un visitante identificable que sobreviva al navegador. La misma
  cuenta evita duplicar identidad; la sesión distinta evita que un comprador alcance el evento.
- **Alternativa descartada — una cuenta de tienda separada:** el par `(issuer, subject)` ya identifica
  a la persona; duplicarlo obligaría a reconciliar dos identidades y a decidir cuál manda.
- **Alternativa descartada — pedir el nombre en el alta:** el nombre no hace falta para registrar ni
  para el interés, y un formulario en el primer acceso agrega fricción y un campo que el proveedor ya
  puede aportar.
- **Consecuencia aceptada — un mismo sujeto tiene dos sesiones, una por superficie:** no hay inicio de
  sesión único entre `frontend` y `shop`; cada origen entra una vez. Disparador: el primer vendedor que
  pida una sola sesión para las dos.
- **Consecuencia aceptada — editar el nombre en la tienda cambia el de la cuenta en la aplicación
  privada:** es la misma fila de `app."user"`. Disparador: un producto que quiera perfiles separados.
- **Consecuencia aceptada — `Cerrar sesión` es local:** igual que la sesión de cuenta de la aplicación.
  La revocación del servidor queda como su propio acto si aparece un dispositivo perdido.
- **Consecuencia aceptada — el enlace público ofrece acceso opcional y regresa a la misma página:** la
  barra de la tienda permite entrar desde `/evento/:publicSlug` o desde una ficha y vuelve al mismo
  camino; no crea interés ni abre el evento. El interés de compra y su mensaje de WhatsApp son 4e.
- **Implementada por:** el corte del ciclo 4d (`plan-ciclo-4d-shop-account`); sin migración.
- **Revisión `live` del dueño, 2026-11-04:** el enlace público del evento carga sin sesión, `Entrar`
  completa el flujo con Google y regresa a la misma página, el nombre visible se fija desde `/cuenta`
  y `Salir` devuelve la barra a `Entrar`. El URI de vuelta de `shop` quedó registrado en el cliente
  público de Google; el backend y el Worker se desplegaron desde `main` con los commits de 4d.
- **Disparador de revisión:** interés de compra que deba admitir visitantes sin cuenta, o una petición
  de sesión única entre superficies.

## 44. El carrito de seleccionados y su solicitud por WhatsApp (2026-11-04, supera a §38 y revisa a §39)

- **Decisión:** el comprador guarda artículos en un carrito de **seleccionados** por comprador y evento
  —una lista de favoritos, no un apartado— y, con su sesión de tienda, pulsa `Pídelos por WhatsApp`.
  Ese acto crea **una solicitud** con su referencia y devuelve el enlace `wa.me` compuesto con el
  WhatsApp que el vendedor fijó en el **dashboard** del evento. El mensaje lleva **solo** la referencia:
  el resto de la conversación ocurre fuera de la aplicación y el vendedor administra el estado de los
  artículos a mano. El panel lista las solicitudes con el nombre de la cuenta y descarta las atendidas.
- **Dos condiciones para el botón:** el número del vendedor configurado y el comprador autenticado. La
  segunda es estructural —el carrito es del servidor y sin sesión `shop` no hay carrito—, así que la
  pantalla solo explica la primera. Sin número, el borde responde `whatsapp_not_configured`.
- **Motivo:** el hecho que el vendedor necesita es «quién quiere qué, esta vez», y el carrito lo guarda
  con el nombre del comprador que 4d ya identifica. La fila de interés por artículo de §38 obligaba a
  pulsar varias veces para pedir varios artículos y no tenía un lugar donde el comprador revisara su
  selección.
- **Alternativa descartada — mantener la fila de interés por artículo (§38):** multiplica pulsaciones y
  no da al comprador una vista de lo que ya eligió.
- **Alternativa descartada — el número del vendedor en la Cuenta del marco:** la Cuenta es de cualquier
  sesión del dispositivo, y el número es del evento y de su administrador (§37). Vive donde el
  administrador ya está.
- **Alternativa descartada — `wa.me` con un número inventado o tomado del evento por otra vía:** no hay
  ningún número en el modelo anterior a este corte y adivinarlo rompería el enlace en silencio.
- **Consecuencia aceptada — guardar no exige cuenta:** la lista vive en el navegador y se **une** al
  carrito del servidor al entrar; en otro dispositivo, lo guardado sin cuenta no viaja.
- **Consecuencia aceptada — la solicitud no cambia nada del artículo:** ni bloquea, ni vence, ni reserva.
  Varios compradores pueden pedir el mismo artículo y el vendedor decide fuera (la exclusividad sigue
  siendo el disparador de §38).
- **Consecuencia aceptada — la instantánea es del momento de pedir:** título y precio se congelan; un
  borrado posterior deja la solicitud con `listing_id` nulo y la evidencia intacta.
- **Consecuencia aceptada — el comprador puede cancelar su solicitud:** escribe `cancelled_at` y el panel
  la muestra como cancelada; una cancelada no se descarta porque ya no hay nada que atender.
- **Consecuencia aceptada — un artículo vendido o sin precio no se guarda ni se pide:** la ficha no
  ofrece guardarlo y dice por qué; el carrito marca el que perdió el precio y deshabilita
  `Pídelos por WhatsApp` con su motivo, en vez de dejar que el borde responda `price_missing` o
  `listing_sold` sin decir cuál. Es la corrección de la revisión `live` del 2026-11-05, que encontró un
  guardado descartado en silencio.
- **Sin total:** el mensaje es la referencia y el importe agregado no tiene consumidor todavía. Queda
  como hecho pendiente con disparador en `resumen-funcional` §6.
- **Implementada por:** el corte del ciclo 4e (`plan-ciclo-4e-carrito-seleccionados-whatsapp`), migración
  `010`; **4f queda absorbido**.
- **Revisión `live` del dueño, 2026-11-05:** el número se fija desde el dashboard del evento; el visitante
  guarda un artículo desde la ficha sin cuenta, entra desde `/carrito/<publicSlug>`, pide y recibe el
  enlace de WhatsApp con su referencia; el panel muestra la solicitud con el nombre de la cuenta y
  `Descartar` la deja en `atendida`. **Hallazgo de la misma revisión, ya corregido:** un artículo sin
  precio se guardaba y el `PUT` lo descartaba en silencio; la ficha ya no ofrece la acción y el carrito
  explica el motivo (commit `4384056`).
- **Disparador de revisión:** el comprador que pida el total, un carrito que deba compartirse entre
  dispositivos, o un vendedor que necesite exclusividad por artículo.
