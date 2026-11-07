# Resumen funcional — MudanzApp

> **Estado:** alcance del ciclo 1 definido; ciclos posteriores tentativos.
> **Naturaleza:** fuente única del **QUÉ**. No se implementa ninguna funcionalidad que no esté
> listada aquí y validada por un ciclo 0 → 1.
> **Dueño:** Architect (alcance). **Disparador de revisión:** cierre de cada ciclo o cambio de
> hipótesis.

## 1. Propósito

Permitir que una persona que se muda a otra ciudad decida, documente y liquide el destino de cada
artículo con evidencia, para que nada valioso se deseche por agotamiento y nada inútil pague flete.

El resultado esperado tiene tres ejes:

- **Económico:** vender lo que conviene recomprar en destino, no trasladar lo que se tirará,
  calcular volumen, peso y protección reales, y reducir o evitar el embodegaje.
- **Cognitivo:** una sola ficha por artículo alimenta la publicación, el empaque, la lista de
  traslado y la verificación en destino.
- **Psicológico:** lo que se regala llega a una persona con nombre, no a la basura.

El efecto buscado es una ruta corta: foto, ficha revisable, precio, publicación y enlace
compartible. La aplicación tiene tres superficies:

| Superficie | Audiencia | Qué hace |
| --- | --- | --- |
| `frontend` | Administrador y los co-dispositivos del evento | Crear el evento, decidir, publicar, cerrar ventas, empaque y traslado |
| `shop` | Cualquier visitante con el enlace | Ver el catálogo y la página de cada artículo; apartar o comprar exige cuenta |
| `wiki` | Público interesado en el proyecto | Dossier técnico: cómo funciona, decisiones, ejemplos y justificación |

`frontend`, `shop` y `wiki` existen en el monorepo, cada uno con su workspace, sus scripts y su
Worker. `shop` nació en el ciclo 3b como **bootstrap** —workspace, shell, puerto y Worker— y desde el
ciclo 3c sirve la **primera página pública de producto** (la ficha de un artículo publicado); el
catálogo y la navegación llegan con `reserve` (4) (decisión §20 de
[`decisiones-tecnicas-app-mudanzapp.md`](decisiones-tecnicas-app-mudanzapp.md)).

Vocabulario de acceso:

- **Administrador:** único. Crea eventos e invitaciones, y opera solo con `ADMIN_TOKEN`: no tiene
  sesión ni factor.
- **Co-dispositivo:** dispositivo que sostiene una sesión del evento. Es la misma cuenta, el mismo
  acceso y los mismos derechos; no es otra persona, no es un rol y no introduce una puerta de
  autenticación. Se llama así al hablar del sistema; la interfaz lo llama «dispositivo vinculado».
- **Cuenta del evento:** factor OAuth que permite volver a entrar desde un dispositivo sin sesión. Es
  recuperación, no una puerta: vincularla no cambia el acceso de ningún otro co-dispositivo.
- **Visitante:** anónimo al leer; con cuenta y sesión de alcance `shop` al apartar o comprar.

## 2. Alcance del primer ciclo

- **Hipótesis:** un enlace de invitación acotado —72 horas y cinco canjes— permite empezar a
  documentar **sin identidad** en el primer dispositivo, y el reclamo con una cuenta conserva ese
  acceso en más de un dispositivo sin transportar secretos entre ellos.
- **Corte vertical:** el administrador crea un evento y una invitación; el invitado canjea el enlace
  y recibe una sesión **de evento** sin identidad; ve su evento y no ve ningún otro; reclama con una
  cuenta y la sesión de evento se sustituye por una **de cuenta**; el enlace deja de servir; el
  administrador revoca una sesión y esa sesión deja de servir.
- **Revisión del ciclo 2:** el reclamo ya no cierra el enlace ni revoca las demás sesiones
  (`decisiones` §30, revisada). El corte anterior se conserva como registro de lo que se implementó y
  validó en el ciclo 1.
- **Evidencia ejecutable:** e2e con `OAUTH_MODE=fake` sobre la base de la dev branch, más unit del
  núcleo de la regla de cuenta: la invitación se agota por tiempo y por canjes, y el reclamo la
  inutiliza.
- **Fuera del ciclo:** artículos y su umbral de identidad, fotos, ficha, publicación, `shop`, pagos,
  apartado, empaque, cotización y verificación.

## 3. Ciclos tentativos

> Los ciclos posteriores al primero son **tentativos**: cada uno depende de lo aprendido en el
> anterior y puede cambiar de corte o de orden. No autorizan implementación por sí solos.

| Ciclo | Hipótesis tentativa | Superficies |
| --- | --- | --- |
| 2 | Un co-dispositivo invitado trabaja en paralelo dentro del mismo evento | `frontend` |
| 3a | Un co-dispositivo documenta su primer artículo con foto en un solo recorrido desde el teléfono | `frontend` |
| 3b | El tercer frontend se despliega y se enruta igual que los otros dos | `shop` |
| 3c | El valor se percibe en el primer artículo compartido por WhatsApp | `frontend` y `shop` |
| 3d | La ficha borrador de la IA se revisa en vez de escribirse | `frontend` y `wiki` |
| 4 | El enlace del evento abre un índice público, su event-administrator administra la ficha y el comprador señala lo que quiere sin ceder datos personales | `frontend` y `shop` |
| 5 | La regla 4/11/21 convierte la cuenta en red de seguridad sin frenar el inicio | `frontend` |
| 6 | La lista de empaque y la de cotización sustituyen la estimación burda | `frontend` y `wiki` |
| D4 | Las secciones perezosas se precargan después de la primera navegación, así el primer clic dentro de una superficie no espera el chunk de su sección | `frontend`, `shop` y `wiki` |
| D8 | Una barra inferior única con `Captura`, `Capturados` y `Cuenta` lleva la navegación privada sin que el evento sea su contenedor | `frontend` |
| D9 | Un co-dispositivo entiende qué sesión tiene este dispositivo —cuenta o no, y su rol en la mudanza— y encuentra en `/cuenta` todas las acciones de su sesión | `frontend` |
| D10 | La administración del evento —co-dispositivos, enlaces, solicitudes y capturas— se abre desde la Cuenta, que es su ruta padre, y el rechazo se lee en ella | `frontend` |

- D4 no es un ciclo de producto: es un corte de rendimiento declarado desde la base 10 de
  [`estructura-ui`](../plans/estructura-ui-navegacion-mudanzapp.md:99) §2. Autoriza solo la
  estrategia de precarga; no cambia rutas, roles, contratos ni datos.
- El ciclo 3 se descompone en 3a–3d. El orden, lo que cada corte compra y su costo viven en
  [`plans/plan-ciclo-3a-captura-articulo.md`](../plans/plan-ciclo-3a-captura-articulo.md:1) §13.

### 3.1 Descomposición del ciclo 4

El ciclo 4 no es un solo corte: el enlace del evento existe desde que el evento se crea, el
event-administrator administra la ficha y el comprador necesita una cuenta para señalar lo que
quiere. Se descompone en seis cortes, cada uno con su hipótesis y su evidencia. La corrección
`4a-fix` no es un corte nuevo: cierra dos brechas de 4a y se ejecuta **antes** de 4b
([`plan-ciclo-4a-correccion-cache-y-cuenta`](../plans/plan-ciclo-4a-correccion-cache-y-cuenta.md:1) §1).

| Corte | Hipótesis | Superficies |
| --- | --- | --- |
| 4a `event-index` | Quien recibe el enlace de un artículo llega por su índice a todo el evento, y el enlace existe desde que el evento se crea, aunque el índice esté vacío | `shop` y `frontend` |
| 4a-fix `cache y Cuenta` | La copia del índice respeta la ventana que 4a declaró y una prueba la defiende; el enlace que 4a crea se reparte desde la Cuenta del marco, sin volver al administrador | `shop` y `frontend` |
| 4b `item-edit` | Cualquier co-dispositivo corrige la ficha y fija el precio, y el catálogo lo refleja; el vendedor declara `Vendido` | `frontend` y `shop` |
| 4c `event-admin` | Solo el event-administrator autenticado administra el evento, y una sesión de co-dispositivo no entra al dashboard | `frontend` |
| 4d `shop-account` | Un visitante se registra y entra en la tienda sin tocar el evento | `shop` |
| 4e `cart-request` | El comprador guarda lo que quiere y lo pide por WhatsApp; el vendedor lo ve en su dashboard y lo descarta | `shop` y `frontend` |
| 4f `cart` | **Absorbido por 4e** (decisión §44): el total derivado y el carrito compartido quedan como hechos pendientes | — |
| 4g `direct-upload` | La foto llega al artículo sin cruzar el backend: el navegador sube las tres variantes al almacén con URL prefirmada, el botón de guardar muestra el progreso real y la `large` tarda lo que tiene que tardar, a la vista | `frontend` |
| E1 `dashboard-plataforma` | El administrador de plataforma ve todos los eventos, crea uno y emite su enlace desde el navegador, con `ADMIN_TOKEN` solo en memoria en esa pestaña | `frontend` |

Reglas que ordenan la secuencia:

- **El precio y el `Vendido` no esperan al dashboard**: la página de edición de `Capturados` los
  pone en manos de quien ya captura, así que el corte de identidad llega después.
- **El hecho del servidor antes de la comodidad del cliente**: el carrito de seleccionados y su
  solicitud existen antes que cualquier comodidad del cliente, y el total —cuando llegue— solo
  multiplica artículos sobre un contrato que ya funciona.
- **Vender no es borrar**: `sold` cierra una venta y conserva la evidencia; `delete` retira una
  captura equivocada y solo lo ejerce el event-administrator.
- **`account-upgrade` (4/11/21) pasa después del ciclo 4**; es el costo declarado de esta ampliación.
- Ninguno de los seis cortes autoriza implementación por sí solo: cada uno abre con su plan, su
  evidencia y su commit.

## 4. Capacidades core declaradas

| Capacidad | Estado | Nota |
| --- | --- | --- |
| `invite` | En alcance del ciclo 1 | Enlace de 72 horas y cinco canjes, revocable; el token lo emite el servidor y el reclamo con cuenta no lo inutiliza |
| `session` | En alcance del ciclo 1 | Token opaco por dispositivo, guardado como hash, con alcance `app` o `shop`, y dueño: una cuenta o un evento |
| `account-link` | En alcance del ciclo 1 | Reclamar un evento con una cuenta OAuth: vincula el sujeto y añade una sesión de cuenta. Es aditivo: no cierra el enlace ni revoca otras sesiones. No es obligatorio para documentar; es el camino de regreso |
| `invite-device` | En alcance del ciclo 2 (cerrado) | Cualquier sesión del evento emite invitaciones para otro co-dispositivo del mismo evento; desde la corrección de 4a la emisión tiene superficie —el card de la Cuenta del marco compone el enlace y no lo persiste— sin cambiar los términos de §30; desde el corte 4c-fix el enlace emitido lleva una palabra de un anillo de 20 y el panel la muestra (decisión §42) |
| `capture` | En alcance del ciclo 3a | Foto y datos mínimos del artículo; la foto se lee solo con sesión del evento hasta `publish`. Desde el corte 4g la subida no cruza el backend: el navegador recibe un ticket con las tres URL prefirmadas y escribe `thumb`, `medium` y `large` en el almacén, el backend sólo verifica el objeto con `HEAD` al adjuntarlo al artículo y el botón de guardado muestra el progreso real de la transferencia (decisión §45) |
| `publish` | En alcance del ciclo 3c | URL legible por artículo, indexable; lectura pública de la foto resuelta en `R2_MODE` (decisión §26). Sin precio ni moneda en 3c: el precio entra nulo en el ciclo 4b (decisión §35). Desde 4b la ficha se sirve como snapshot HTML y muestra precio y `Vendido`. Publicar exige foto y no hay despublicar ni `slug` editable; desde 4c-4 el event-administrator retira una captura equivocada y un artículo vendido no se borra (`item_sold`, §40). Sin migración: la cascada la impone el DDL de 3c. Desde 4g la foto llega al artículo por una adjunción que verifica las tres variantes con `HEAD`, las copia a su clave definitiva y escribe las filas; el cuerpo de la foto ya no atraviesa el backend (decisión §45) |
| `ai-draft` | En alcance del ciclo 3d (cerrado) | Ficha borrador con salida validada en la frontera; produce **solo** título y nota, nunca medidas, peso, precio ni destino; el borrador es efímero (no hay tabla ni historial) y solo la revisión humana escribe (decisión §34); el transporte por bytes de la mediana se confirmó `live` en producción el 2026-11-01 |
| `event-index` | En alcance del ciclo 4a (cerrado) | `public_slug` del evento, inmutable una vez publicado; índice público con estado vacío y enlace de vuelta desde cada ficha (decisión §36); se sirve como snapshot HTML con clave de versión desde la primera publicación y el componente solo reemplaza la lista si la versión difiere; revisado `live` en el móvil del dueño el 2026-11-02; la corrección de 4a deja en vigor la ventana de 60 segundos con `stale-while-revalidate` de 10 minutos y la aserción que la defiende. Desde 4b la tarjeta pinta el precio y el índice excluye las fichas vendidas |
| `item-edit` | En alcance del ciclo 4b (cerrado) | Página de edición desde `Capturados` para cualquier sesión del evento; corrige título, nota, medidas y `price_cents`, y el `slug` publicado no cambia. Un precio nulo muestra «Precio a consultar» y deshabilita «Lo quiero» (decisión §35); revisado `live` por el dueño el 2026-11-02 |
| `event-admin` | En alcance de los ciclos 4c-2, 4c-3 y 4c-4 (cerrados en el gate local) | El primer invitado del evento que se autentica lo reclama y `is_admin` también entra; una sesión de co-dispositivo responde `forbidden` (decisión §37). El panel publica quién administra, el enlace público, el contador de capturas, los co-dispositivos y los enlaces emitidos, y ejerce tres actos con confirmación en dos toques: des-invitar un co-dispositivo (4c-2), cancelar un enlace —sin expulsar a quien ya entró por él (4c-3)— y retirar una captura equivocada, que responde `409 item_sold` si está vendida (4c-4, §40). La sesión del rey no aparece en su lista y el acto la rechaza. Desde el corte 4c-fix el panel nombra cada enlace con su palabra del anillo (§42) y pinta su emisión con hora. Las revisiones `live` de 4c-3, 4c-4 y del corte 4c-fix las cerró el dueño el 2026-11-04: los enlaces se nombran, se cancelan por su nombre y el token responde `410` |
| `shop-account` | En alcance del ciclo 4d (cerrado con revisión `live` del dueño el 2026-11-04) | El visitante entra por primera vez con el mismo flujo OAuth del evento y recibe una sesión de alcance `shop`, sin membresía ni evento. El nombre es opcional y se fija **después** del primer acceso desde `/cuenta`; el perfil usa la misma cuenta `(issuer, subject)` del producto y la base sigue sin teléfono, correo ni dirección (decisión §43). Una sesión de tienda no abre `/auth/session` ni las rutas del evento, y una de la aplicación no abre la tienda. El enlace público del evento y la ficha ofrecen `Entrar` opcional en la barra de la shell y, tras el acceso, vuelven a la misma página; el interés y su WhatsApp pertenecen a 4e. La revisión `live` confirmó el enlace público anónimo, el acceso opcional desde la barra, el regreso a la misma página, el nombre opcional y la salida local. Sin migración: `app.session.scope` ya admite `shop` |
| `cart-request` | En alcance del ciclo 4e (cerrado con revisión `live` del dueño el 2026-11-05) | Carrito de **seleccionados** por comprador y evento, con `PUT` que reemplaza entero; guardar no exige cuenta y pedir sí. `Pídelos por WhatsApp` compone el enlace con el número que el vendedor fija en el **dashboard**; sin número el botón no se habilita. La solicitud congela título y precio del momento y el vendedor la ve y la descarta desde su panel. Un artículo vendido o sin precio no se guarda ni se pide: la ficha lo dice antes y el carrito lo marca. Sin bloqueo, sin vencimiento y sin exclusividad; ningún estado del artículo cambia (decisión §44, que supera a §38 y revisa a §39). La revisión `live` confirmó el número desde el dashboard, la selección sin cuenta, el regreso al carrito, el enlace de WhatsApp y el descarte en el panel; el hallazgo de la misma revisión —un artículo sin precio descartado en silencio— quedó corregido en `4384056` |
| `settle-sale` | En alcance del ciclo 4b (cerrado) | El vendedor marca `Vendido` en cualquier estado publicado, con `sold_at` y sin monto registrado; el índice deja de ofrecerlo y la ficha conserva `200` con `noindex` durante treinta días y después responde `410` (decisión §40); revisado `live` por el dueño el 2026-11-02 |
| `platform-admin` | En alcance del corte E1 | Superficie de plataforma en `frontend` (`/admin/plataforma`) sobre las rutas de `ADMIN_TOKEN`: `GET /admin/events` paginado por cursor —con la fecha de creación y quién administra, nulo mientras nadie reclama—, `POST /admin/events` y `POST /admin/events/:eventId/invitations`. La credencial se escribe en la pantalla y vive **solo en memoria** de esa pestaña: recargar la pierde y ninguna plantilla la enlaza (decisión §46). No hay sesión de plataforma, ni rol nuevo, ni cambio de esquema |
| `route-preloading` | En alcance del corte D4 | Cada superficie precarga sus secciones perezosas después de la primera navegación: el primer clic dentro de una superficie no espera el chunk de su sección. No cambia rutas, roles, contratos ni datos; solo la estrategia de carga de Angular |
| `shell-nav` | En alcance del corte D8 (cerrado con revisión `live` del dueño el 2026-11-06) | La superficie privada tiene una barra inferior fija con `Captura`, `Capturados` y `Cuenta` como destinos de nivel raíz. El evento se resuelve de la sesión, las pantallas de detalle quedan fuera de la barra y las URLs `/eventos/:eventId/...` se conservan como redirecciones. Sin backend, sin contrato nuevo y sin migración. La revisión `live` en remoto confirmó la barra, los tres destinos, la Cuenta mínima con el acceso al dashboard y el aterrizaje en `/captura` al canjear o volver del proveedor |
| `cuenta-ruta` | En alcance del corte D9 (cerrado con revisión `live` del dueño el 2026-11-06) | `/cuenta` publica la identidad y el estado del dispositivo —cuenta vinculada o no, y el rol de la membresía activa—, el trayecto y el enlace público del evento, la vinculación de cuenta, la invitación a otro dispositivo, el canje de otra invitación y el cierre de sesión. La carga de la identidad y la sesión inválida tienen su propio estado. Sin backend, sin contrato nuevo y sin migración; el `deviceLabel` de la sesión no se publica. La revisión `live` en remoto confirmó la pantalla con el estado del dispositivo, el rol de la membresía, el trayecto y el enlace del evento, y las acciones de sesión |
| `cuenta-evento` | En alcance del corte D10 (cerrado con revisión `live` del dueño el 2026-11-07) | La administración del evento es una ruta hija de `/cuenta` (`/cuenta/evento`): quien administra la abre desde su Cuenta, la barra marca Cuenta y el co-dispositivo que la pide vuelve a `/cuenta` con el aviso. `/dashboard` y `/eventos/:eventId/dashboard` se conservan como redirecciones. Sin backend, sin contrato nuevo y sin migración. La revisión `live` en remoto confirmó la administración en `/cuenta/evento` desde la Cuenta, el rechazo del co-dispositivo en `/cuenta` con la familia del fallo y la redirección de `/dashboard` |
| `account-upgrade` | Tentativa, ciclo 5 | Regla 4/11/21 como función pura |
| `packing`, `quote-brief`, `receive-check` | Tentativa, ciclo 6 | Empaque, lista para cotizar y verificación en destino |
| `decide-destination` | Propuesta, sin ciclo | Los cinco destinos y la clase A B C |

- Una capacidad core no se implementa hasta que su ciclo defina alcance y evidencia. «Tentativa» y
  «Propuesta» no autorizan construir nada.
- El arranque permaneció cero-features: solo contiene el humo necesario para verificar el stack.
- Las tres superficies son la topología técnica fijada en el stack, no capacidades de negocio.

## 5. Fuera de alcance

- Cobro en línea y cualquier pasarela de pago.
- Datos personales de visitantes: nombre, teléfono, correo o dirección. Las operaciones que los
  requerirían ocurren en WhatsApp, fuera de la aplicación.
- Portal o cuenta para proveedores de mudanza: son externos y se manejan por teléfono o WhatsApp.
- Automatización de WhatsApp y bots de conversación.
- Tarjeta de vista previa por artículo (registrada con disparador, ver decisión §28).
- Passkey (registrada con disparador, ver decisión §29).
- Indexación curada, sitemap y posicionamiento pagado.
- Cuentas de comprador persistentes fuera del evento.

Nada de lo no listado en este documento se considera aprobado, aunque exista en el stack o en el
código de referencia.

- **Resuelto en el ciclo 3c:** la lectura pública de fotos y su política de retención. La foto forma
  parte de `R2_MODE` (decisión §26), la URL la emite el backend desde la base pública y la retención
  aprobada es «mientras exista el `listing`», con barrido manual de objetos huérfanos (decisión §31).

## 6. Hechos pendientes de dueño

| Hecho | Dueño | Disparador de revisión |
| --- | --- | --- |
| Umbral de identidad: si documentar sin cuenta se corta en el artículo 21 y con qué código falla | Architect con el usuario | Apertura de `account-upgrade` (ciclo 5); el ciclo 3a no impone umbral |
| Semántica de `APP_MODE` frente a publicación propia | Architect con el usuario | Antes de construir cualquier adaptador APP |
| Monto registrado al cerrar una venta | Architect con el usuario | Antes de `settle-sale` |
| Alcance del dossier en `wiki` | Architect | Apertura del ciclo que lo toque. **Cerrado para la sección 3**: `foto-a-ficha` se escribió en el ciclo 3d |
| Cuota, rate limit o presupuesto de gasto de la IA | Architect con el usuario | Primera factura inesperada o una sesión que repita el botón en bucle; el ciclo 3d no construye tope |
| Política de datos del proveedor de IA | Architect con el usuario | Cambio de política del proveedor, o aparición de un dato personal en una foto enviada a la IA |
| Dependencia de verificación de tokens OIDC | Architect con el usuario | Al abrir el ciclo que implemente `account-link`; su aprobación explícita se registra en el stack §12, en su propio commit `deps` |

## 7. Regla de uso

- El alcance es una hipótesis hasta que la revisión del ciclo lo valide: se implementa el corte más
  pequeño que permita aprender, no la cobertura completa.
- Si falta un hecho, el ciclo no se abre: se registra el vacío y se pregunta.
- Ningún documento de stack o plantilla amplía este alcance; si el alcance cambia, se propone el
  cambio con su costo (`.guidelines/01`).
