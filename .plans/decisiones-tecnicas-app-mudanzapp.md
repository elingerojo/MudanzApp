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

## 2. Dos frontends desde el inicio

- `frontend` es la SPA principal; `wiki` es una SPA Angular propia con su mapa de rutas, que crece
  una ruta por ciclo y puede consumir el backend con sus propios contratos.
- Motivo: ambos existen desde el inicio y comparten la misma forma técnica; el contrato del
  monorepo queda simétrico.
- Evidencia: decisión del usuario y
  [`stack-tecnologico-app-mudanzapp.md`](stack-tecnologico-app-mudanzapp.md:19).

## 3. Integraciones y modos

- Integraciones declaradas: APP (primaria, reemplaza Wix), R2 (almacenamiento opcional) y AI.
- `APP_MODE`, `R2_MODE` y `AI_MODE` con `live`/`fake`, default `live`. Una variable vacía cuenta
  como ausente; solo `live` y `fake` son valores válidos; cualquier otro valor produce un error
  estable en la primera petición.
- El modo solo se lee cuando la capacidad existe; sin capacidad no se construye adaptador ni se
  exige credencial.
- `live` exige credenciales válidas; `fake` es el doble determinista de pruebas mientras se
  consiguen las credenciales.
- `APP_MODE` gobierna solo las credenciales de la integración primaria.
- `AI_MODEL` se parametriza si aplica; el ID del modelo no se cablea.
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

## 11. Invitación como intención de futuro alcance

- `invite` se registra como **intención de futuro alcance**, no como capacidad core comprometida: no
  declara alcance, garantía, fecha ni corte.
- Su función es servir de criterio al evaluar caminos de implementación cuando esa capacidad se
  evalúe; no autoriza construir nada por sí sola.
- No forma parte del código de arranque: su script y su camino canónico (autorizado) llegan con su
  propio ciclo.
- Motivo: el bootstrap se mantiene cero-features y un criterio de evaluación no es una capacidad.
- Evidencia: `resumen-funcional-app-mudanzapp.md` §4 y decisión del usuario (auditoría `C3`).

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
