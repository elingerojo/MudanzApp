# Plan del ciclo 3e — `gallery`: hasta seis fotos por artículo, con el orden decidido durante la captura

> **Estado:** **plan ejecutable, sin ejecutar.** Ninguna rama abierta, ninguna migración aplicada y
> ningún commit.
> **Hipótesis:** un co-dispositivo documenta un artículo con hasta seis fotos, decide el orden durante
> la captura y lo cambia después solo para publicar, sin que publicar con una sola foto deje de
> funcionar.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4 (filas por
> promover); [`backlog`](backlog-funcionalidades-pendientes.md:74) fila A1; [`plan-ciclo-3d`](plan-ciclo-3d-borrador-ia.md:486)
> §18; [`plan-ciclo-4g`](plan-ciclo-4g-direct-upload.md:1) §3 y §5;
> [`modelo-datos`](../.plans/modelo-datos-app-mudanzapp.md:64) §1;
> [`referencia-ux-ui`](referencia-ux-ui.md:8) inclinaciones 4, 5, 6, 8, 11 y 12;
> [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:101) §3.

## 0. Hecho o decisión que abre el corte

| Pregunta                                    | Respuesta del dueño                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Cuántas fotos por artículo?                | **6, tope duro de toda la aplicación.** Ya existe como `CAPTURE_LIMITS.photos`; no se cambia.                                         |
| ¿Cuándo se decide el orden?                 | **Durante la captura**, con el mismo esquema que `Retomar la foto`: se actúa sobre la tira y la sesión termina al guardar o publicar. |
| ¿Se puede reordenar después de guardar?     | Sí, **solo para publicar**, desde `Capturados`.                                                                                       |
| ¿Ese orden posterior llega al modelo?       | No. El borrador se pide durante la captura y lee el orden de ese momento.                                                             |
| ¿Se pueden añadir fotos después de guardar? | Sí, y esas fotos solo entran al **orden de publicación**; nunca al borrador.                                                          |
| ¿Qué pasa con una sola foto?                | **No se ven los controles de orden.** Una permutación de una foto no es un acto.                                                      |
| ¿El orden se guarda dos veces?              | No. `app.item_photo.position` es el orden de publicación; el orden de la IA vive en la sesión y muere al guardar.                     |

## 1. Hipótesis y corte

- **Qué compra:** un artículo puede llevar varias fotos, con la primera como portada; el orden de
  captura decide qué foto abre el borrador y en qué secuencia; el orden de publicación se puede
  corregir desde `Capturados`; y los tres lectores privados (lista, panel y edición) muestran la
  portada.
- **Qué no compra:** el borrador con varias fotos (3i), el estado de subida por foto (3f), la galería
  pública (3g), borrar una foto, arrastrar y soltar, ni cambiar el tope de 6.
- **Costo declarado:** ruptura de contrato en `shared` (`photo` → `photos`), **una ruta nueva**, dos
  superficies (captura y edición), la extracción del pipeline de foto y la sesión de captura como
  lista ordenada. **Sin migración** y **sin dependencias nuevas**.

## 2. Fuera de este corte

- Todo lo de 3i, 3f y 3g.
- Borrar una foto de la galería. Disparador: el primer artículo con una foto equivocada que no se
  pueda retirar sin borrar el artículo.
- Arrastrar y soltar para reordenar. Los botones de subir y bajar bastan y no traen dependencia.
- Cambiar el tope de 6 o hacerlo configurable.
- Reordenar desde la ficha pública.
- Un carrusel, un lightbox o un visor a pantalla completa en la superficie privada.
- Que la edición posterior pueda alterar el orden que vio la IA: eso ya no existe como hecho.
- Reintentos y estado por foto: hoy una subida fallida se reintenta en conjunto (3f lo hará por foto).

## 3. Datos

**Ninguno.** `app.item_photo.position` ya existe, `NOT NULL DEFAULT 0`, con
`CONSTRAINT item_photo_position_key UNIQUE (item_id, position)` y `CHECK (position >= 0)`
([`004_item.sql`](../backend/sql/004_item.sql:40)). El backlog ya reservó el camino sin migración. Este
corte **no** escribe DDL: el orden de publicación es la columna que ya está.

## 4. Contrato

```text
ItemSummary.photos: readonly ItemPhoto[]        // ordenado; el índice 0 es la portada
ItemPhoto                                        // sin cambios: id y los tres tamaños
AttachedPhotos.photos                            // misma forma; ahora es la galería ordenada

POST /events/:eventId/items/:itemId/photos       // existe desde 4g; 1..6 capturas con su slot
  200 { photos }
  401 unauthorized | 404 not_found | 409 item_sold
  400 capture_incomplete | photo_invalid

PUT /events/:eventId/items/:itemId/photos/order  // nuevo
  body { photoIds: [uuid, ...] }                 // 2..6, exactamente las fotos del artículo, sin repetir
  200 { photos }                                 // el orden nuevo, ya aplicado
  400 validation_failed                          // forma, longitud o ids repetidos
  401 unauthorized
  404 not_found                                  // evento, artículo o foto ajena
  409 photo_order_mismatch                       // el conjunto ya no coincide: otro dispositivo añadió o borró
  409 item_sold                                  // la galería de un artículo vendido está congelada
```

Reglas que el contrato fija:

- **El orden es el arreglo.** No se publica `position`: un segundo campo que dice lo mismo que el
  índice es una fuente duplicada.
- **Mínimo dos fotos.** Una permutación de una sola foto es un no-op y se rechaza en la frontera.
- `photo_order_mismatch` es honesto: el cliente envió un conjunto que ya no existe. No se «repara»
  silenciosamente reordenando lo que haya.
- **La permutación se aplica en una transacción, en dos pasadas**: `UPDATE … SET position = position + 100`
  para todas las fotos del artículo, luego cada una a su índice destino, y ninguna queda fuera. El
  desplazamiento temporal es necesario porque `UNIQUE (item_id, position)` se comprueba por fila y
  `CHECK position >= 0` prohíbe los negativos; `101..105` no puede chocar porque el esquema no pasa
  de `position 5`.
- El `slot` de la adjunción sigue siendo del cliente y `upsertItemPhoto` sigue siendo un _upsert_ por
  `(item_id, position)`: adjuntar en un slot ocupado lo reemplaza. Es la costura que 4g dejó; el
  riesgo está en §11.

## 5. Superficies y UI

**Panel de captura** ([`capture.component.html`](../frontend/src/app/events/capture.component.html:1)).
Dentro de la tarjeta que ya existe, sin pestaña nueva y sin ruta nueva (inclinación 5):

- Dos entradas: `Tomar foto` con `capture="environment"` y `Elegir de la galería` con `multiple`.
- La tira: una miniatura por foto, la primera marcada `Portada`, con la leyenda
  `La primera foto abre la ficha y alimenta el borrador` (inclinaciones 6 y 10: texto, no tour).
- Contador, no porcentaje: `3 de 6` (inclinación 11).
- Controles de orden (subir y bajar) **solo con dos o más fotos**; deshabilitados en los extremos.
- La promoción de 3k manda en el peso de `Borrador con IA` y `Repetir la foto`; la tira no compite
  con `Publicar` (inclinación 4).
- Estado vacío: la entrada visible y la leyenda de la portada; nunca un modal.
- Error: `photo_invalid` y `capture_incomplete` conservan sus mensajes actuales; un fallo de subida
  mantiene el artículo creado y ofrece reintentar, como hoy.
- Con una sola foto no hay controles de orden ni se llama a la ruta de orden.

**Edición del artículo** ([`item-edit.component.html`](../frontend/src/app/items/item-edit.component.html:10)).
La misma tira, montada desde la pieza extraída, con `Añadir fotos` y los controles de orden. Aquí el
orden es **de publicación**: la pantalla lo dice con una línea, sin vocabulario de IA.

**Capturados** ([`item-list.component.html`](../frontend/src/app/items/item-list.component.html:20)) y
**panel del evento** ([`dashboard.component.html`](../frontend/src/app/events/dashboard/dashboard.component.html:115)).
La miniatura sale de `photos[0]`; sin fotos, el marcador `sin foto` y el aviso de que sin foto no se
publica se conservan.

**Roles.** Igual que hoy: cualquier sesión del evento añade y reordena durante la captura; el orden de
publicación se cambia desde la edición, que ya admite cualquier sesión del evento. Un artículo vendido
no acepta cambios de galería.

## 6. Cambios por archivo

| Archivo                                                                                                      | Cambio                                                                   | Por qué sirve a la hipótesis                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| [`shared/src/item.ts`](../shared/src/item.ts:180)                                                            | `ItemSummary.photo` → `photos`; docblock del contrato                    | Es la ruptura que el corte compra                    |
| [`shared/src/capture.ts`](../shared/src/capture.ts:167)                                                      | `AttachedPhotos` documenta que es la galería ordenada; esquema del orden | Una sola forma para adjuntar y ordenar               |
| [`shared/src/onboarding.ts`](../shared/src/onboarding.ts:1)                                                  | Añade `orderControlsVisible(count)`                                      | Una regla para las dos superficies                   |
| [`backend/src/store/item-store.ts`](../backend/src/store/item-store.ts:85)                                   | La foto de posición 0 pasa a lista ordenada en una sola consulta         | Sin N+1 y sin cambiar el número de lecturas          |
| `backend/src/store/item-store.ts`                                                                            | Nueva escritura de la permutación, en transacción y dos pasadas          | El acto de orden, con su restricción respetada       |
| [`backend/src/routes/presenters.ts`](../backend/src/routes/presenters.ts:179)                                | `toItemSummary` publica el arreglo ordenado                              | El orden se lee, no se recalcula                     |
| [`backend/src/routes/items-router.ts`](../backend/src/routes/items-router.ts:270)                            | `PUT …/photos/order` con sus códigos estables                            | La ruta nueva del corte                              |
| [`frontend/src/app/events/photo-inbox.store.ts`](../frontend/src/app/events/photo-inbox.store.ts:21)         | La sesión pasa a lista ordenada; `hasPhoto` = hay al menos una           | La barra y la guarda no se desincronizan de la tira  |
| `frontend/src/app/items/photo-pipeline.ts`                                                                   | Nuevo: optimizar, ticket, subir y adjuntar una foto a un artículo        | Una sola tubería para captura y edición              |
| `frontend/src/app/items/photo-gallery.component.ts` y `.html`                                                | Nuevos: tira, dos entradas, contador, orden y portada                    | La pieza compartida por las dos superficies          |
| [`frontend/src/app/items/item-form.component.ts`](../frontend/src/app/items/item-form.component.ts:323)      | Usa el pipeline y la tira; el borrador lee la **portada**                | Mantiene el recorrido de una foto y añade la galería |
| [`frontend/src/app/items/item-form.component.html`](../frontend/src/app/items/item-form.component.html:1)    | Sustituye el input único por la tira y las dos entradas                  | Es la superficie del corte                           |
| `frontend/src/app/items/item-edit.component.ts` y `.html`                                                    | Monta la tira con añadir y reordenar                                     | El orden de publicación se corrige aquí              |
| [`frontend/src/app/events/capture-session.guard.ts`](../frontend/src/app/events/capture-session.guard.ts:13) | `hasPhoto` sigue significando «hay captura viva»                         | El panel no se abre vacío (D13)                      |
| `frontend/src/app/app.ts`                                                                                    | Sin cambio de comportamiento: la barra lee el mismo `hasPhoto`           | La barra conserva su forma y sus estados (D14)       |
| [`e2e/photos.spec.ts`](../e2e/photos.spec.ts:1)                                                              | Orden de captura, permutación y una sola foto                            | La evidencia del corte                               |
| [`e2e/support/attach-capture.ts`](../e2e/support/attach-capture.ts:67)                                       | Adjuntar con `slot` explícito                                            | Permite armar galerías en las pruebas                |
| `e2e/item-edit.spec.ts`                                                                                      | Añadir y reordenar desde la edición                                      | La segunda superficie                                |

## 7. Evidencia

e2e, en navegador real:

- Seis fotos por el panel devuelven seis fotos ordenadas, con la primera como portada, y la lista
  privada muestra esa portada.
- Reordenar durante la captura cambia el orden con el que se adjuntan (`slot` por foto) y sobrevive a
  la publicación.
- `PUT …/photos/order` con una permutación válida devuelve el arreglo nuevo; recargar la edición lo
  conserva.
- Con **una** foto no se renderizan controles de orden y **no** se emite ninguna petición de orden.
- Enviar un conjunto que ya no coincide responde `409 photo_order_mismatch` y no reordena nada.
- Un artículo vendido responde `409 item_sold` al intentar cambiar la galería.
- Publicar con **una** sola foto sigue funcionando sin pasos nuevos (la regresión que importa).

Unidad:

- `orderControlsVisible(1) === false` y `orderControlsVisible(2) === true`.
- La derivación del orden en el presentador conserva el orden de entrada.

Gate proporcional (uno por invocación, una corrida a la vez):

- `npm run typecheck`, `npm run lint`, `npm run format:check`
- `npm run test:web:frontend` y `npm run test:web:shop` (`shared` tocado)
- `npm run build:web:frontend` y `npm run build:web:shop`
- `npm run test:api:db:branch`
- `npm run typecheck:e2e` y `npm run test:e2e:branch`, después de `npm run db:migrate:branch:test`
  (el arnés no migra; el esquema de la rama de prueba no cambia, pero el comando se corre igual)

## 8. Orden de implementación

1. Promoción en `resumen-funcional` §3 y §4; fila A1 del backlog a `planeada`; este plan escrito.
2. **Movimiento puro:** extraer `photo-pipeline.ts` y `photo-gallery.component` del formulario, sin
   cambiar la plantilla. e2e de fotos, captura y publicación en verde antes de seguir. Commit
   `refactor(web)`.
3. `PhotoInboxStore` como lista ordenada; barra y guarda sin cambio visible.
4. `shared`: `photo` → `photos`, esquema del orden y `orderControlsVisible`. Rompe la compilación a
   propósito; se arregla en los pasos siguientes.
5. Backend: lectura ordenada, presentador, `PUT …/photos/order` con la transacción de dos pasadas.
6. Formulario de captura con la tira, las dos entradas y el borrador mirando la portada.
7. Lista, edición y panel: `photos[0]`.
8. Edición con añadir y reordenar.
9. e2e nuevo y extendido.
10. Gate, commit `feat(shared)` y delta del wiki en el mismo commit.

## 9. Rama, base y entrega

- **Rama:** `_branch`. **Base local:** `mudanzapp_branch`, pruebas `mudanzapp_branch_test`.
- **Migraciones:** ninguna nueva. Los comandos del gate de e2e se corren igual para dejar la base de
  prueba en el esquema vigente.
- **Si la revisión contradice la hipótesis:** el corte no se integra. El caso más probable es que seis
  fotos sean demasiadas para el uso real; entonces el tope baja en un corte propio y el contrato no se
  toca otra vez.
- **Commits:** `refactor(web)` para el movimiento puro y `feat(shared)` para el corte, cada uno con su
  cuerpo y su línea de wiki.

## 10. Correcciones de fuente que el corte exige

| Archivo                                                                         | Sección                                                                     | Corrección                                                                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`item-edit.component.ts`](../frontend/src/app/items/item-edit.component.ts:47) | docblock                                                                    | «La foto no se reemplaza en este corte» deja de ser cierto: se añaden fotos y se reordena para publicar.                                                      |
| [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:147)         | §4, fila `item-edit`                                                        | Añade que la galería se edita desde esta pantalla y que el orden es el de publicación.                                                                        |
| [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:101)                    | §3, fila «Captura multi-foto con presign, miniatura y compresión en worker» | Su disparador («publish + R2 live») ya se cumplió y la afirmación es parcialmente falsa desde 4g: se parte en dos, la galería privada aquí y el worker en 3f. |
| [`shared/src/item.ts`](../shared/src/item.ts:5)                                 | docblock del contrato                                                       | La foto deja de ser una capacidad singular; el borrador lee la portada.                                                                                       |

## 11. Riesgos y disparadores

| Riesgo                                                                                           | Qué lo dispara                                 | Qué se hará                                                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La permutación choca con `UNIQUE (item_id, position)` o con `CHECK (position >= 0)`              | Un `23505` en la base durante el e2e           | Es el riesgo previsto: dos pasadas con desplazamiento `+100` dentro de una transacción; si aun así falla, se agrega un índice diferible en un corte propio |
| Dos dispositivos añaden a la vez y el `slot` elegido por el cliente sobrescribe la foto del otro | Una foto perdida en `live`                     | Slot asignado por el servidor: cambio de contrato, corte propio. Mientras tanto, `photo_order_mismatch` detecta el desorden, no la pérdida                 |
| La extracción del pipeline rompe el progreso de 4g o el cierre de D14                            | Un rojo en `photos`, `capture` o `publish` e2e | El movimiento puro va en su propio commit y con la evidencia verde antes de montar nada nuevo                                                              |
| Al volver al panel se re-optimizan las seis fotos y la interfaz se congela                       | La revisión `live` de este corte               | Es el disparador declarado de 3f                                                                                                                           |
| La ruptura de contrato deja plantillas a medias                                                  | `typecheck` en rojo con varios consumidores    | La lista de §6 es la lista completa; no se declara terminado hasta que las cuatro plantillas y el e2e compilan                                             |

## 12. Alternativas evaluadas

| Alternativa                                                               | Por qué se descartó                                                                                             | Qué la reabriría                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Dos columnas de orden (IA y publicación)                                  | El orden de la IA muere al guardar y no se vuelve a leer; una columna para un hecho histórico es un dato muerto | Un requisito real de volver a consultar el modelo con el orden original |
| Reordenar adjuntando de nuevo con otros `slot`                            | Obligaría a reenviar bytes que ya están en el almacén                                                           | Nada                                                                    |
| Guardar la galería como JSON en el artículo                               | Rompe la normalización y la unicidad que ya existen                                                             | Nada                                                                    |
| Un componente de arrastrar y soltar                                       | Dependencia nueva y peor accesibilidad que dos botones                                                          | Un pedido explícito del dueño                                           |
| Mantener la foto única en la sesión y una galería aparte en el formulario | Dos fuentes de la misma lista: la barra y la guarda se desincronizan                                            | Nada                                                                    |

## 13. Cierre

Se escribe al cerrar: fecha, sha corto, evidencia observada, revisión `live` del dueño y lo que quede
pendiente con su disparador.

## 14. Prueba `live` en remoto (paso manual del dueño)

Sin migración en este corte.

1. Desplegar la rama según `Man-3.4`.
2. Con una foto: tomar una desde `Foto`, guardar y publicar. Es la regresión que importa y debe costar
   exactamente lo mismo que antes.
3. Con tres fotos: en `/captura`, una desde `Tomar foto` y dos desde `Elegir de la galería`. Reordenar
   en la tira hasta que la portada sea la que se quiere, guardar sin publicar.
4. Ir a `Capturados`, abrir el artículo, añadir una cuarta foto y subirla a primera. Recargar: la
   miniatura de la lista es la nueva portada.
5. Publicar y abrir el enlace público: **sigue mostrando solo la primera foto**. Es lo esperado hasta
   3g, no un defecto.
6. Lo único que un dispositivo prueba y un escritorio no: que `Tomar foto` abre la cámara, que
   `Elegir de la galería` permite selección múltiple, y que la tira se puede reordenar con una mano.
