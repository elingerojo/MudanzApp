# Plan del ciclo 3k — `nivel-onboarding`: la promoción del panel de captura se deriva de lo que la mudanza ya publicó

> **Estado:** **plan ejecutable, sin ejecutar.** Ninguna rama abierta, ninguna migración aplicada y
> ningún commit.
> **Hipótesis:** la importancia entre `Borrador con IA` y `Repetir la foto` puede derivarse de cuántos
> artículos del evento se publicaron alguna vez, y la persona puede subir ese nivel desde `Cuenta`
> cuando la promoción no le sirve.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4 (fila por
> promover en este corte); [`backlog`](backlog-funcionalidades-pendientes.md:1) fila nueva 3k;
> [`referencia-ux-ui`](referencia-ux-ui.md:8) inclinaciones 1, 2, 3, 4, 6, 10 y 11;
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:102) §3;
> [`workflow-ciclos`](workflow-ciclos.md:96) §4; [`plan-ciclo-3d`](plan-ciclo-3d-borrador-ia.md:100) §6.

## 0. Hecho o decisión que abre el corte

Decisiones del dueño, tomadas entre el 2026-11-12 y el 2026-11-13. Sustituyen cualquier lectura
anterior de estas hojas.

| Pregunta                                                  | Respuesta del dueño                                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ¿De dónde sale el nivel?                                  | **Event-driven**: del número de artículos publicados del evento. No es un valor por dispositivo ni una elección libre. |
| ¿Cuál es la tabla?                                        | **0 a 2 publicados ⇒ 1 foto** al borrador. **3 o más ⇒ 2 fotos**. Esa tabla, y nada más, por ahora.                    |
| ¿Se puede elegir el nivel?                                | Sí, **subir** desde `Cuenta`. El valor derivado es el _default_, no una cárcel.                                        |
| ¿Cuántas fotos admite un artículo?                        | **6, tope duro de toda la aplicación.** No se toca en este corte.                                                      |
| ¿El máximo de fotos al modelo es configurable por evento? | **No.** Es una tabla `nivel → fotos`, distinta del tope duro de 6.                                                     |
| ¿Niveles futuros (volumen, empaque)?                      | Se **modela la forma** ahora (tabla como dato, `smallint`, evidencia como objeto). **No se definen niveles futuros.**  |

## 1. Hipótesis y corte

- **Qué compra:** un hecho nuevo —el nivel de onboarding efectivo de un evento— publicado al cliente,
  y una regla de promoción aplicada a la pantalla que ya existe: a nivel 0 el borrador de IA lidera y
  `Repetir la foto` es discreto; a nivel 1 los dos pesan igual. El hecho queda listo para que 3i lo
  consuma sin volver a tocar la derivación.
- **Qué no compra:** fotos múltiples (3e), un borrador con varias fotos (3i), estado de subida por foto
  (3f), galería pública (3g), ningún nivel por encima de 1, ningún cambio al tope duro de 6, ninguna
  pantalla nueva ni tour de bienvenida.
- **Costo declarado:** una migración **aditiva** (`014`), un módulo puro en `shared`, un campo en
  `EventSummary`, una ruta de escritura, la promoción en el formulario de captura y una fila en
  `Cuenta`. **Sin dependencias nuevas.** Sin tablas nuevas.

## 2. Fuera de este corte

- El nivel 2 y cualquier nivel futuro. Un nivel sin acción que promover es un valor sin lector, y su
  fila en `resumen-funcional` §4 declararía una capacidad que no existe.
- Cualquier cambio de fotos: la captura sigue siendo una foto por artículo hasta 3e.
- Cualquier cambio del borrador: sigue leyendo una sola foto hasta 3i.
- Persistir la elección **por dispositivo** (`localStorage`) o por cuenta. El nivel es del evento y su
  pantalla es `Cuenta`; un segundo almacén divergiría del derivado.
- Un tour modal, una pantalla de objetivos o un globo sobre el botón. La explicación vive como texto en
  la fila de `Cuenta` y en el propio panel (inclinaciones 6 y 10).
- Un panel de administración para fijar el nivel a mano. La subida es un acto de la persona, no una
  configuración del evento.

## 3. Datos

Archivo nuevo `backend/sql/014_event_onboarding_level.sql`. Numeral libre confirmado: `011` sigue sin
usarse, `012` y `013` están tomados por `4c-fix` y `F3`.

```sql
-- 014_event_onboarding_level.sql — nivel de onboarding del evento (corte 3k).
-- Solo hacia adelante e idempotente. Sin `DROP` y sin tabla de seguimiento.

ALTER TABLE app.event
  ADD COLUMN IF NOT EXISTS onboarding_level smallint;

-- Forma idempotente equivalente, sin `DROP`: la restricción se crea solo si no existe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'event_onboarding_level_check'
       AND conrelid = 'app.event'::regclass
  ) THEN
    ALTER TABLE app.event
      ADD CONSTRAINT event_onboarding_level_check
      CHECK (onboarding_level IS NULL OR onboarding_level BETWEEN 0 AND 9);
  END IF;
END $$;
```

- **Por qué `smallint` y no `boolean`:** agregar el nivel 2 mañana no debe costar una migración.
- **Por qué el rango es `0..9` y no `0..1`:** el máximo real es un hecho del producto y vive en
  `ONBOARDING_LEVELS` (`shared`); la frontera HTTP valida contra ese máximo. El `CHECK` es la red de
  seguridad, no la regla. Un `0..1` aquí obligaría a migrar para agregar un nivel que no existe.
- **`NULL` significa «sin elección»**: el nivel efectivo sale del derivado.
- **Sin `DROP`, sin tabla de seguimiento, sin transacción propia** (el runner abre una por archivo).
- **Destinos:** local `branch` y `branch_test`; remoto `branch`. `main` no se toca hasta la integración
  del corte, y ninguna migración corre en el arranque.

## 4. Contrato

```text
GET /auth/session
200 IdentityState
    event: EventSummary | null
    EventSummary.onboardingLevel: 0 | 1        // efectivo, resuelto por el servidor

PATCH /events/:eventId/onboarding-level
  body { level: 0 | 1 }
  200 { level: 0 | 1 }                         // el efectivo después de escribir
  400 validation_failed                         // fuera de rango o forma inválida
  401 unauthorized                              // sin sesión
  404 not_found                                 // el evento no existe o no es alcanzable
```

Reglas del contrato:

- El cuerpo se valida con un esquema en `shared`; una clave de más falla.
- Escribir un valor **menor** que el derivado no es un error: se guarda y el efectivo sigue siendo el
  derivado, porque `effective = max(derived, floor)`. La UI solo ofrece subir.
- La respuesta publica el **efectivo**, no el piso guardado: es lo único que las superficies
  necesitan y evita que dos clientes calculen distinto.
- Autorización: cualquier sesión del evento puede subir el nivel, igual que puede invitar un
  dispositivo. No es un permiso, es una promoción (inclinación 3). Si una revisión `live` muestra que
  un co-dispositivo molesta al dueño, el corte siguiente lo restringe a `requireEventAdministrator`
  sin cambiar el contrato.

## 5. Superficies y UI

**Formulario de captura** ([`item-form.component.html`](../frontend/src/app/items/item-form.component.html:15)).
La plantilla no decide la promoción: la lee de `promotionFor(level)`.

| Nivel | `Borrador con IA`     | `Repetir la foto` | `Publicar` / `Solo guardar` |
| ----- | --------------------- | ----------------- | --------------------------- |
| 0     | estilo promovido      | discreto          | primario, sin cambios       |
| 1     | igual que el anterior | igual             | primario, sin cambios       |

El primario real sigue siendo publicar: la promoción decide **qué se ofrece como siguiente paso**, no
qué se puede hacer (inclinación 4). Nada se oculta en ningún nivel.

**Cuenta** ([`cuenta.component.ts`](../frontend/src/app/session/cuenta.component.ts:1)). Una fila nueva,
debajo de `Cambiar de mudanza` y fuera de los enlaces de administración:

- Nivel 0: `El borrador de IA usa 1 foto. Publica 3 artículos para usar 2.` más la acción
  `Subir de nivel`.
- Nivel 1: `El borrador de IA usa 2 fotos.` sin acción.
- Los textos y el umbral salen de `ONBOARDING_LEVELS`; la pantalla no repite el `3` (una sola fuente).
- Una sesión de alcance tienda no tiene evento: la fila no se renderiza.
- Error de la escritura: mensaje estable, la fila conserva el valor anterior y no navega a ningún lado.
- Éxito: la fila cambia en el mismo lugar; sin modal, sin toast nuevo.

## 6. Cambios por archivo

| Archivo                                                                                                    | Cambio                                                                                  | Por qué sirve a la hipótesis                                        |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `backend/sql/014_event_onboarding_level.sql`                                                               | Nuevo: columna y `CHECK`                                                                | El piso elegido necesita un hecho, no una preferencia del navegador |
| [`shared/src/onboarding.ts`](../shared/src/onboarding.ts:1)                                                | Nuevo: `ONBOARDING_LEVELS`, `onboardingLevelFor`, `promotionFor`, `photosForLevel`      | Una sola tabla y una sola derivación para ambas superficies         |
| [`shared/src/identity.ts`](../shared/src/identity.ts:34)                                                   | `EventSummary` gana `onboardingLevel`                                                   | El cliente lee el hecho, no lo calcula                              |
| [`shared/src/index.ts`](../shared/src/index.ts:1)                                                          | Exporta el módulo nuevo                                                                 | Punto único de importación                                          |
| [`backend/src/store/identity-store.ts`](../backend/src/store/identity-store.ts:1)                          | Las lecturas del evento traen `onboarding_level` y el conteo publicado; nueva escritura | Una consulta por hecho, sin N+1                                     |
| [`backend/src/routes/presenters.ts`](../backend/src/routes/presenters.ts:58)                               | `toEventSummary` compone el nivel efectivo                                              | La derivación no se duplica en el cliente                           |
| [`backend/src/routes/events-router.ts`](../backend/src/routes/events-router.ts:182)                        | `PATCH /events/:eventId/onboarding-level`                                               | El acto de subir, con la forma de `/contact`                        |
| [`frontend/src/app/items/item-form.component.html`](../frontend/src/app/items/item-form.component.html:15) | Clases de la promoción por nivel                                                        | Es el cambio visible del corte                                      |
| [`frontend/src/app/items/item-form.component.ts`](../frontend/src/app/items/item-form.component.ts:123)    | Lee el nivel del evento activo y expone el modelo de promoción                          | Una fuente para las clases                                          |
| [`frontend/src/app/session/cuenta.component.ts`](../frontend/src/app/session/cuenta.component.ts:1)        | Fila de nivel, acción de subir y su error                                               | La persona puede corregir la promoción                              |
| `frontend/src/app/session/cuenta.component.html`                                                           | Plantilla de la fila                                                                    | Plantilla separada, como el resto                                   |
| `frontend/src/app/session/session.store.ts`                                                                | Acción que escribe el nivel y refresca la identidad                                     | Mantiene el hecho del servidor como fuente                          |
| `e2e/onboarding-level.spec.ts`                                                                             | Nuevo: nivel 0 frente a nivel subido                                                    | La evidencia del cambio visible                                     |
| [`plans/estructura-ui-navegacion-mudanzapp.md`](estructura-ui-navegacion-mudanzapp.md:102)                 | Corrige la fila que declara el onboarding fuera de alcance                              | Su disparador es esta entrada                                       |
| [`.plans/resumen-funcional-app-mudanzapp.md`](../.plans/resumen-funcional-app-mudanzapp.md:66)             | Fila del corte en §3 y capacidad en §4                                                  | Promoción previa al plan (workflow §4)                              |

## 7. Evidencia

Unidad (`shared`, Vitest):

- `onboardingLevelFor({ publishedCount: 0 }, null) === 0`; `1` y `2` también; `3` y `10` dan `1`.
- `onboardingLevelFor({ publishedCount: 0 }, 1) === 1` y `onboardingLevelFor({ publishedCount: 5 }, 0) === 1`
  — el piso sube, el derivado manda, nada desciende.
- `promotionFor(0)` promueve el borrador y deja discreto el reintento; `promotionFor(1)` los iguala.
- `photosForLevel(0) === 1` y `photosForLevel(1) === 2`; ambos por debajo del tope duro de 6.

e2e (`e2e/onboarding-level.spec.ts`):

- Con el evento en nivel 0, el botón del borrador lleva el estilo promovido y `Repetir la foto` el
  discreto.
- Tras `Subir de nivel` en `Cuenta`, recargar conserva el nivel (el hecho es del servidor) y los dos
  botones quedan iguales.
- El texto de la fila cambia con el nivel y nombra el umbral de la tabla.
- El `PATCH` con una forma inválida responde `400 validation_failed`.

Gate proporcional (uno por invocación, una corrida a la vez):

- `npm run typecheck`, `npm run lint`, `npm run format:check`
- `npm run test:web:frontend`
- `npm run build:web:frontend` y `npm run build:web:shop` (`shared` tocado)
- `npm run test:api:db:branch` (backend con base)
- `npm run typecheck:e2e` y `npm run test:e2e:branch`, después de `npm run db:migrate:branch:test`

## 8. Orden de implementación

1. Promoción en `resumen-funcional` §3 y §4, y fila 3k en el backlog con estado `planeada`.
2. Escribir este plan y corregir la fila de `estructura-ui` §3.
3. `014` y su aplicación a mano: `db:migrate:branch` y `db:migrate:branch:test`.
4. `shared/src/onboarding.ts` con sus unit, antes de tocar servidor o plantillas.
5. Lecturas del evento con el conteo, `toEventSummary` con el nivel efectivo y la ruta `PATCH`.
6. Promoción en el formulario de captura.
7. Fila de `Cuenta` con la acción y el error.
8. `e2e/onboarding-level.spec.ts`.
9. Gate completo y commit `feat(web)`.
10. Delta del wiki en el mismo commit.

## 9. Rama, base y entrega

- **Rama:** `_branch` (una sola dev branch de base de datos, local y remota).
- **Base local:** `mudanzapp_branch`; pruebas `mudanzapp_branch_test`.
- **Migraciones:** a mano, nunca en el arranque.
  `npm run db:migrate:branch`, `npm run db:migrate:branch:test`, y en remoto
  `npm run db:migrate:remote:branch` antes de que el despliegue de la rama sirva el código nuevo.
- **Si la revisión contradice la hipótesis:** el corte se queda en la dev branch, sin integrar. El
  hallazgo va a la bandeja y el nivel no se consume en 3i hasta que la promoción se decida de nuevo.
- **Commit:** `feat(web)` con hipótesis, corte y evidencia en el cuerpo, más la línea de wiki.

## 10. Correcciones de fuente que el corte exige

| Archivo                                                                | Sección                                              | Corrección                                                                                                                             |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:102)           | §3, fila «Onboarding, splash, PWA, editor de imagen» | Deja de ser «no se copia»: el nivel se declara y este corte lo construye. Se reemplaza por la fila del nivel con su ciclo y su estado. |
| [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) | §3 y §4                                              | Fila del corte 3k y capacidad `onboarding-level`, con la tabla 0–2/3+ y la subida desde `Cuenta`.                                      |
| [`backlog`](backlog-funcionalidades-pendientes.md:1)                   | §2                                                   | Fila 3k nueva, costo S–M, fuente este plan.                                                                                            |

## 11. Riesgos y disparadores

| Riesgo                                                                                                                | Qué lo dispara                                                             | Qué se hará                                                                           |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Un co-dispositivo sube el nivel y cambia la pantalla del dueño                                                        | La primera queja del dueño en `live`                                       | Restringir la escritura a `requireEventAdministrator`, sin cambiar el contrato        |
| El nivel derivado desciende si el administrador borra un artículo publicado (la fila de `app.listing` cae en cascada) | Una bajada observada en `live`                                             | Contador monótono `published_total` en el evento: decisión nueva, un segundo escritor |
| La promoción se lee como un error de estilo y no como una invitación                                                  | La primera sesión `live` donde nadie entiende por qué el borrador pesa más | Cambiar la copia antes que el mecanismo; el modelo no se toca                         |
| La tabla invita a inventar niveles por calendario                                                                     | Una fila de nivel sin acción que promover                                  | No se agrega: un nivel nace con la acción que promueve, en su propio corte            |
| `EventSummary` gana un campo y algún consumidor lo compara por igualdad estructural                                   | Un rojo en `shop` o en una prueba de contrato                              | Agregar el campo al comparador; es aditivo por diseño                                 |

## 12. Alternativas evaluadas

| Alternativa                                       | Por qué se descartó                                                                         | Qué la reabriría                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Guardar el nivel como valor único, sin derivación | Un segundo escritor que puede contradecir la evidencia y hacer descender el nivel           | Nada: la evidencia es la fuente (inclinación 1)                      |
| Piso por dispositivo en `localStorage`            | La misma mudanza tendría dos niveles en dos teléfonos, y `Cuenta` es la pantalla del evento | Un caso real de dos personas que quieran niveles distintos           |
| `boolean` en la columna                           | Agregar el nivel 2 costaría una migración                                                   | Solo si el producto se congela en dos niveles                        |
| Subida sin persistencia, solo por visita          | La elección dejaría de significar algo al recargar                                          | Si se prefiere no migrar en este corte, se declara como corte propio |
| Cuatro niveles con la tabla anterior              | El dueño fijó dos escalones y nada más                                                      | Cuando exista la acción que promueva el tercero                      |

## 13. Cierre

Cerrado en `a6df36e` el 2026-11-13. Evidencia en verde: `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run test:web:frontend` (33 archivos, 230 pruebas), `npm run test:api`
(285 pruebas), `npm run test:api:db:branch` (311 pruebas; `test/db/onboarding-level` en verde y los
tres rojos de `item-photos` son preexistentes —token fijo sobre el sandbox reutilizado— y no ejercen
este corte), `npm run build:web:frontend`, `npm run build:web:shop`, `npm run build:web:wiki`,
`npm run test:web:wiki` (13 pruebas), `npm run typecheck:e2e` y `npm run test:e2e:branch` (25
pasaron, 44 omitidas por proyecto).

Lo que la evidencia demuestra: `onboardingLevelFor` deriva 0 con 0–2 publicados y 1 desde 3, un piso
menor no desciende el efectivo y un piso fuera de tabla se recorta; `promotionFor(0)` promueve el
borrador y deja discreto el reintento, y `promotionFor(1)` iguala las dos acciones; el `PATCH`
responde `400 validation_failed` fuera de rango o con una clave de más, `404 not_found` a un evento
que la sesión no alcanza y publica el efectivo aunque el piso guardado sea menor. El e2e
`onboarding-level` confirma el estilo promovido a nivel 0, la fila de `Cuenta` nombrando el umbral,
la subida desde `Cuenta` y su persistencia tras recargar, y los dos botones iguales a nivel 1. La
migración `014` se aplicó a mano en `branch` y `branch_test` locales.

Revisión `live` del dueño: **pendiente**. Su disparador es la prueba manual del §14 en remoto, con
la migración del esquema antes del despliegue.

Pendiente con su disparador: la restricción de la escritura a `requireEventAdministrator` si un
co-dispositivo molesta al dueño (primera queja en `live`); el contador monótono si la evidencia
desciende al borrar un artículo publicado (una bajada observada en `live`); y la copia de la
promoción si se lee como un error de estilo (la primera sesión donde nadie entienda por qué el
borrador pesa más).

## 14. Prueba `live` en remoto (paso manual del dueño)

Orden importa: **primero el esquema, después el despliegue.**

1. `npm run db:migrate:remote:branch` con `backend/.env.migration.local` resuelto por el script. Sin
   esta columna, la lectura del evento falla después del despliegue.
2. Desplegar la rama según `Man-3.4` (el servicio ya define `PORT=3000`).
3. En el teléfono, con un evento de la rama que tenga **0 a 2** artículos publicados, abrir `/captura`
   con una foto: el botón `Borrador con IA` debe liderar y `Repetir la foto` verse discreto.
4. Abrir `/cuenta`: la fila debe decir `El borrador de IA usa 1 foto. Publica 3 artículos para usar 2.`
   con la acción `Subir de nivel`.
5. Pulsar `Subir de nivel`, **recargar** y comprobar dos cosas: la fila dice `2 fotos` y los dos botones
   pesan igual. La recarga es la prueba de que el hecho es del servidor.
6. Publicar un tercer artículo y recargar `/cuenta`: sigue en 2 fotos, ahora por evidencia y no por el
   piso. No hay nada que un dispositivo pruebe aquí: un navegador basta, y lo único que se confirma es
   que el nivel no vive en el cliente.
