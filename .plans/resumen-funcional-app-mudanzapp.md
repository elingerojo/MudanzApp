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

`frontend` y `wiki` existen en el monorepo. `shop` está declarada y sin artefacto: su workspace, sus
scripts y su Worker llegan con su ciclo de bootstrap (decisión §20 de
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
| 3 | El valor se percibe en el primer artículo compartido por WhatsApp | `frontend` y `shop` |
| 4 | El catálogo público se navega y el bloqueo protege al vendedor sin frenar al comprador | `shop` |
| 5 | La regla 4/11/21 convierte la cuenta en red de seguridad sin frenar el inicio | `frontend` |
| 6 | La lista de empaque y la de cotización sustituyen la estimación burda | `frontend` y `wiki` |

## 4. Capacidades core declaradas

| Capacidad | Estado | Nota |
| --- | --- | --- |
| `invite` | En alcance del ciclo 1 | Enlace de 72 horas y cinco canjes, revocable; el token lo emite el servidor y el reclamo con cuenta no lo inutiliza |
| `session` | En alcance del ciclo 1 | Token opaco por dispositivo, guardado como hash, con alcance `app` o `shop`, y dueño: una cuenta o un evento |
| `account-link` | En alcance del ciclo 1 | Reclamar un evento con una cuenta OAuth: vincula el sujeto y añade una sesión de cuenta. Es aditivo: no cierra el enlace ni revoca otras sesiones. No es obligatorio para documentar; es el camino de regreso |
| `invite-device` | Tentativa, ciclo 2 | Cualquier sesión del evento emite invitaciones para otro co-dispositivo del mismo evento |
| `capture` | Tentativa, ciclo 3 | Foto y datos mínimos del artículo |
| `ai-draft` | Tentativa, ciclo 3 | Ficha borrador con salida validada; la IA no fija dimensiones ni peso definitivos |
| `publish` | Tentativa, ciclo 3 | URL legible por artículo, indexable |
| `reserve` | Tentativa, ciclo 4 | Bloqueo de 15 minutos por visitante con cuenta |
| `settle-sale` | Tentativa, ciclo 4 | El vendedor marca `Vendido` en cualquier estado |
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

## 6. Hechos pendientes de dueño

| Hecho | Dueño | Disparador de revisión |
| --- | --- | --- |
| Umbral de identidad: si documentar sin cuenta se corta en el artículo 21 y con qué código falla | Architect con el usuario | Antes de `capture` |
| Semántica de `APP_MODE` frente a publicación propia | Architect con el usuario | Antes de construir cualquier adaptador APP |
| Monto registrado al cerrar una venta | Architect con el usuario | Antes de `settle-sale` |
| Lectura pública de fotos y su política de retención | Architect / Backend | Antes de `capture` |
| Alcance del dossier en `wiki` | Architect | Apertura del ciclo que lo toque |
| Dependencia de verificación de tokens OIDC | Architect con el usuario | Al abrir el ciclo que implemente `account-link`; su aprobación explícita se registra en el stack §12, en su propio commit `deps` |

## 7. Regla de uso

- El alcance es una hipótesis hasta que la revisión del ciclo lo valide: se implementa el corte más
  pequeño que permita aprender, no la cobertura completa.
- Si falta un hecho, el ciclo no se abre: se registra el vacío y se pregunta.
- Ningún documento de stack o plantilla amplía este alcance; si el alcance cambia, se propone el
  cambio con su costo (`.guidelines/01`).
