# Plan del ciclo E1 — `dashboard-plataforma`: el administrador de plataforma opera sin `curl` y sin guardar la credencial

> **Estado:** **cerrada en `0e917e6` (2026-11-06).** Sin migración, sin dependencia nueva y sin
> rama por ciclo.
> **Hipótesis:** el administrador de plataforma puede ver todos los eventos, crear uno y emitir su
> enlace desde el navegador, sosteniendo `ADMIN_TOKEN` solo en la memoria de esa pestaña.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4;
> [`backlog`](backlog-funcionalidades-pendientes.md:125) fila E1;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1119) §46;
> [`workflow-ciclos`](workflow-ciclos.md:230) §13.

## 0. Hecho o decisión que abre el corte

| Pregunta                                                                                 | Respuesta                                                                                                            | Fecha      |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| Una superficie de navegador no puede sostener `ADMIN_TOKEN`, como dice `workflow` §13.3. | El dueño eligió la opción (a): la credencial se **escribe en la pantalla** y vive **solo en memoria**. Decisión §46. | 2026-11-06 |
| ¿Superficie?                                                                             | `frontend`, ruta `/admin/plataforma`. `shop` y `wiki` son públicas y no tienen nada que hacer con la administración. | 2026-11-06 |
| ¿La credencial entra en `localStorage` como la sesión de un dispositivo (decisión §27)?  | No. La sesión de un dispositivo es de una persona y sobrevive la pestaña; esta es una credencial de plataforma.      | 2026-11-06 |

## 1. Hipótesis y corte

- **Qué compra:** el ciclo de alta de un evento deja de depender de `curl`. El administrador abre una
  pantalla, pega la credencial, ve los eventos con su fecha y su administrador —nulo mientras nadie lo
  reclama—, crea uno y emite su enlace, todo con el mismo `ADMIN_TOKEN` que hoy usa la consola.
- **Qué no compra:** no crea una sesión ni un rol de plataforma, no recuerda la credencial entre
  recargas y no edita ni borra eventos.
- **Costo declarado:** una ruta nueva en `frontend`, un contrato nuevo en `shared`
  (`AdminEventSummary`, `AdminEventPage`, cursor), una lectura nueva en el backend
  (`GET /admin/events`), un archivo de tienda y una pantalla. **Sin migración y sin dependencias
  nuevas.**

## 2. Fuera de este corte

- Sesión de plataforma con OAuth, `app.user.is_admin` como puerta de la plataforma y cualquier alcance
  de sesión nuevo (alternativas descartadas en §46).
- Backend-for-frontend en el Worker de `frontend` y secreto de despliegue.
- Editar, renombrar o borrar un evento (F1 y X10 son sus propios cortes).
- Las rutas de sesiones del `admin-router` (`GET /admin/events/:eventId/sessions`,
  `DELETE /admin/sessions/:sessionId`): la pantalla no las usa y no se tocan.
- Reclamar un evento sin rey (E4) y retirar una membresía (E2).
- Paginación de las listas del evento (D1) y de la tienda.

## 3. Datos

Sin migración. `app.event` ya tiene `created_at` y `admin_user_id` (`002_identity.sql` y
`009_event_admin.sql`); la lectura nueva solo los proyecta.

## 4. Contrato

```text
GET /admin/events?limit=<1..100, default 20>&cursor=<opaco>
200 { events: AdminEventSummary[], nextCursor: string | null }
400 validation_failed | 401 admin_unauthorized | 503 admin_not_configured

AdminEventSummary {
  id, publicSlug, originCity, destinationCity, currency, state,
  createdAt, administratorName: string | null
}
```

- El orden es `created_at DESC, id DESC`; el cursor es `(createdAt, id)` codificado en base64url. Un
  cursor ilegible responde `validation_failed` y no se ignora.
- `nextCursor` es `null` en la última página. La lectura pide `limit + 1` filas para saberlo sin
  contar.
- `publicSlug` se deriva con `deriveEventPublicSlug` cuando la fila es anterior al ciclo 4a, igual que
  `toEventSummary`: el enlace nunca queda vacío.
- `administratorName` es `null` mientras nadie reclama el evento: el contrato no inventa el hecho.
- Las tres rutas de escritura ya existen y no cambian: `POST /admin/events`,
  `POST /admin/events/:eventId/invitations`.

## 5. Superficies y UI

- Ruta `/admin/plataforma` en `frontend`, perezosa y **sin guarda de sesión**: la puerta es la
  credencial, no una sesión. Con la credencial vacía la pantalla no pide nada al borde.
- Estado 1 — sin credencial: campo de contraseña, «Entrar» y una frase que dice que la credencial vive
  solo en esta pestaña.
- Estado 2 — con credencial: la lista de eventos (trayecto, `publicSlug`, fecha, administrador o «sin
  reclamar»), «Ver más» cuando hay `nextCursor`, el formulario de alta (origen, destino, moneda) y por
  fila «Emitir enlace», que muestra el enlace `…/invitacion?token=…` una sola vez.
- Errores: `admin_unauthorized` → «La credencial no es válida»; `admin_not_configured` → «La
  plataforma no tiene `ADMIN_TOKEN` configurado»; el resto, su frase genérica. Un fallo no vacía la
  lista.
- Plantilla en `platform-admin.component.html`, nunca inline. Primitivas `app-ui-card` y
  `uiButtonClasses`, como el resto de la aplicación.

## 6. Cambios por archivo

| Archivo                                                               | Cambio                                                                              | Por qué                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `shared/src/admin.ts`                                                 | Contrato, esquema de query y cursor de la lista de plataforma                       | Una sola fuente de la forma y de la codificación del cursor |
| `shared/src/index.ts`                                                 | Exporta el contrato nuevo                                                           | El hub del contrato compartido                              |
| `backend/src/store/identity-store.ts`                                 | `listEventsForPlatform` con su SQL parametrizado y el `LEFT JOIN` del administrador | La lectura paginada por cursor                              |
| `backend/src/routes/presenters.ts`                                    | `toAdminEventSummary`                                                               | La traducción fila → contrato vive en un solo lugar         |
| `backend/src/routes/admin-router.ts`                                  | `GET /events` paginado                                                              | La ruta que falta para la pantalla                          |
| `backend/test/routes/admin-events.test.ts`                            | Frontera: 200, 400, 401, 503 y el cursor                                            | La evidencia del corte                                      |
| `frontend/src/app/platform-admin/platform-admin.store.ts`             | Credencial en memoria, lista, alta y emisión                                        | El estado de la pantalla                                    |
| `frontend/src/app/platform-admin/platform-admin.component.ts`         | La pantalla                                                                         | La superficie                                               |
| `frontend/src/app/platform-admin/platform-admin.component.html`       | Plantilla separada                                                                  | Nunca inline                                                |
| `frontend/src/app/platform-admin/platform-admin.component.spec.ts`    | Credencial en memoria, lista, alta y emisión                                        | La evidencia de la superficie                               |
| `frontend/src/app/session/auth.interceptor.ts`                        | Una petición con `Authorization` propio pasa intacta                                | La credencial de plataforma no se sustituye por la sesión   |
| `frontend/src/app/session/auth.interceptor.spec.ts`                   | La aserción nueva                                                                   | Fija ese hecho                                              |
| `frontend/src/app/app.routes.ts`                                      | Ruta `/admin/plataforma`                                                            | El acceso                                                   |
| `frontend/src/app/home/home.component.html`                           | Enlace discreto a la pantalla                                                       | Entrar sin `curl` ni memorizar una URL                      |
| `wiki/src/app/app/a1-administracion/a1-administracion.component.html` | La ruta nueva y la credencial en memoria                                            | El delta del tile dueño (A1)                                |
| `wiki/src/app/app/a1-administracion/a1-administracion.component.ts`   | `platform-admin` en las áreas                                                       | La cabecera de frescura                                     |

## 7. Evidencia

- `GET /admin/events` sin `Authorization` responde `401 admin_unauthorized`; sin `ADMIN_TOKEN`
  configurado, `503 admin_not_configured`.
- Con credencial responde `200` con `publicSlug` derivado cuando la fila no lo tiene,
  `administratorName` nulo en un evento sin reclamar y el nombre cuando lo tiene.
- Con tres filas y `limit=2`, la primera respuesta trae dos eventos y un `nextCursor`; la segunda, con
  ese cursor, trae el tercero y `nextCursor: null`. El SQL recibe el cursor como parámetro, nunca
  interpolado.
- Un `cursor` ilegible y un `limit` fuera de rango responden `400 validation_failed`.
- La pantalla no pide nada al borde mientras no hay credencial; tras escribirla pide la primera página
  con `Authorization: Bearer`, y `localStorage` sigue sin la credencial.
- Crear un evento emite `POST /admin/events` y recarga la lista; emitir un enlace publica el token una
  sola vez con su `label` y su vencimiento.
- El interceptor deja intacta una petición que ya trae `Authorization`.

## 8. Orden de implementación

1. Contrato en `shared` y su exportación.
2. Lectura en el almacén, presentador y ruta del backend.
3. Prueba de frontera del backend.
4. Tienda, pantalla, ruta y enlace del frontend; interceptor y su prueba.
5. Prueba de la pantalla.
6. Delta del tile A1 y cabecera de frescura.
7. Gate de `workflow` §7 con `frontend/` tocado.

## 9. Rama, base y entrega

- Sin migración: no se aplica ningún `db:migrate:*` y la dev branch de base de datos no se toca.
- Sin rama de código por ciclo: el corte vive donde la regla lo permita, con una sola dev branch.
- Si la revisión contradice la hipótesis —la credencial en memoria resulta inservible en el uso real—
  el corte se detiene y la alternativa (b) o (c) de §46 vuelve al dueño antes de seguir.

## 10. Correcciones de fuente que el corte exige

- `.plans/resumen-funcional-app-mudanzapp.md` §3 y §4: la fila del corte y la capacidad
  `platform-admin` (promoción de `workflow` §4).
- `.plans/decisiones-tecnicas-app-mudanzapp.md` §46: la decisión que abrió el corte.
- `plans/backlog-funcionalidades-pendientes.md` fila E1: el estado `planeada`.

## 11. Riesgos y disparadores

| Riesgo                                                                    | Qué lo dispara                                                   | Qué se hará                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| La credencial en memoria se vuelve incómoda y alguien la pega en el disco | una petición de recordarla, o un `ADMIN_TOKEN` en `localStorage` | Reabrir §46 y evaluar la alternativa (c), backend-for-frontend  |
| Un cursor viejo deja de servir si el orden cambia                         | un cambio en el orden de `GET /admin/events`                     | El cursor es opaco: el cliente no lo interpreta, solo lo repite |
| La pantalla crece hasta ser un panel de plataforma completo               | la primera petición de editar o borrar un evento                 | F1/X10, con su propio corte y su decisión                       |
| Una segunda persona necesita administrar la plataforma                    | la primera cuenta que pida acceso sin el token                   | Alternativa (b) de §46, decisión nueva                          |

## 12. Alternativas evaluadas

- **(b) Sesión de plataforma con OAuth:** descartada en §46; exige un sujeto y un alcance nuevos.
- **(c) Backend-for-frontend en el Worker de `frontend`:** descartada en §46; añade secreto de
  despliegue y un paso manual de `Man-3.4` sin que el hecho lo pida.

## 13. Cierre

- **Fecha y sha:** 2026-11-06, `0e917e6` — `feat(web): add the platform admin surface over
ADMIN_TOKEN`.
- **Evidencia observada:** el gate de `workflow` §7 con `frontend/` y `shared/` tocados corrió
  completo, un comando por invocación, en verde: `typecheck`, `lint`, `format:check`,
  `build:web:frontend`, `build:web:shop`, `build:web:wiki`, `test:api` (269/269, 7 nuevos),
  `test:web:frontend` (142/142, 10 nuevos) y `test:web:wiki` (12/12). Las aserciones de §7 se
  cumplieron una por una, incluida la que falla si la credencial aparece en `localStorage` y la que
  exige que el cursor vuelva al SQL como parámetro.
- **Revisión `live`:** no aplica. El corte no crea una variable de entorno —`ADMIN_TOKEN` ya existía—
  ni cambia un Worker, un dominio o una migración, así que no hay hecho remoto que verificar
  (`07` §5).
- **Delta del wiki:** A1 (tile dueño, `backend/src/routes/admin-router.ts`), más A0 —la ruta en el
  mapa de superficies— y E2 —la capacidad en su tabla—. E3 sin delta: el gate no cambió.
- **Pendiente con su disparador:**
  - Editar, renombrar o borrar un evento: F1 y X10 del backlog, cada uno con su decisión.
  - Sesión de plataforma con OAuth y backend-for-frontend: alternativas (b) y (c) de la decisión §46;
    se reabren con el disparador escrito allí —una segunda persona que necesite administrar, o una
    credencial que deba vivir más que una pestaña.
  - e2e de la superficie: no se construyó porque la hipótesis se responde con la frontera y la
    pantalla. Su disparador es la primera regresión del interceptor de sesión o de la lista que el
    unit no atrape.
  - El aviso de presupuesto de bundle sigue siendo la deuda D5, ajena a este corte.
