# Plan del ciclo 3i — `borrador-multifoto`: el borrador lee hasta dos fotos, en el orden de la captura

> **Estado:** **cerrado con el gate local.** Sin migración, sin dependencia nueva y con el gate
> completo en verde, incluido `test:e2e:branch`. La revisión `live` (§14) quedó **descartada por
> decisión del dueño** el 2026-11-13: la hipótesis se acepta con la evidencia local.
> **Hipótesis:** un borrador construido con las dos primeras fotos del orden de captura describe mejor
> el artículo que uno construido con una sola, al costo que el nivel de la mudanza permite pagar.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4 (fila por
> promover); [`backlog`](backlog-funcionalidades-pendientes.md:1) fila nueva 3i;
> [`plan-ciclo-3d`](plan-ciclo-3d-borrador-ia.md:1) §4, §6 y §17;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:751) §34;
> [`plan-ciclo-4g`](plan-ciclo-4g-direct-upload.md:1) §13;
> [`referencia-ux-ui`](referencia-ux-ui.md:8) inclinaciones 4, 6, 10 y 11.

## 0. Hecho o decisión que abre el corte

| Pregunta                                      | Respuesta del dueño                                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Cuántas fotos lee el modelo?                 | **Según el nivel de onboarding del evento**, que se deriva de lo publicado: `0–2` publicados ⇒ **1 foto**; `3` o más ⇒ **2 fotos**. La tabla vive en `shared` y la fija 3k. |
| ¿Es configurable por evento?                  | **No.** Es una tabla `nivel → fotos`, distinta del tope duro de 6.                                                                                                          |
| ¿Una entrada por foto o una llamada por foto? | **Una sola llamada** con todas las fotos como contexto.                                                                                                                     |
| ¿En qué orden viajan?                         | **En el orden de la captura**, el mismo que el dueño decidió en 3e.                                                                                                         |
| ¿El backend obliga el máximo?                 | **No.** El backend usa tantas fotos como lleguen: las convierte a base64 y las usa como contexto. El tope del nivel es una regla de la captura.                             |
| ¿Qué tiene que verificar la frontera?         | Solo cordura de transporte: cantidad contra el **tope duro de 6**, tipo de cada parte y tope total de bytes.                                                                |
| ¿Transporte?                                  | **Framed bundle** dentro de `shared`, sin base64 en el borde y sin dependencia nueva.                                                                                       |
| ¿Cuántas fotos ve el público?                 | Todas las publicadas. El máximo del borrador no recorta la ficha (eso es 3g).                                                                                               |

## 1. Hipótesis y corte

- **Qué compra:** el borrador puede construirse con dos ángulos del mismo artículo, elegidos por su
  orden de captura, y la pantalla dice cuántas fotos se van a usar y cuáles. La hipótesis es
  refutable: si la revisión `live` muestra que el texto no mejora, el corte lo registra y la tabla
  puede quedarse en una foto sin tocar el mecanismo.
- **Qué no compra:** que el servidor aplique el nivel; cuota o tope de llamadas (C4 sigue con su
  disparador); reintento de la llamada al modelo; una llamada por foto; guardar qué se envió; prompt
  distinto por foto; y ningún cambio en la galería pública.
- **Costo declarado:** un módulo puro de framing en `shared` con sus unit, un tope de bytes nuevo, el
  lector compartido con tope parametrizado, la ruta del borrador, la costura del proveedor y su doble,
  y el contador en la tira. **Sin migración y sin dependencias nuevas.** Depende de **3k** y **3e**.

## 2. Fuera de este corte

- Cualquier validación del nivel en el backend. La ruta no conoce el evento, ni el artículo, ni la base:
  conserva la virtud de 3d.
- Base64 como transporte navegador → backend. El borde sigue recibiendo binario.
- Multipart y, con él, una dependencia de parseo.
- Que el backend lea las fotos del almacén: es la opción B2 que [`plan-ciclo-4g` §13](plan-ciclo-4g-direct-upload.md:1)
  descartó, y reabrirla es una decisión nueva.
- Reintento automático del proveedor, streaming de la respuesta y caché de borradores.
- Volver a consultar el modelo después de guardar: el orden de la IA muere al guardar y esa capacidad
  quedó cancelada.
- Un máximo de fotos por artículo distinto de 6.

## 3. Datos

**Ninguno.** El borrador sigue siendo efímero: no hay tabla, no hay historial y no se guarda la foto ni
lo que se envió ([`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:751) §34). Guardar el
conjunto enviado sería un registro de la IA, y eso es otra decisión.

## 4. Contrato

### El cuerpo

```text
POST /events/:eventId/ai/drafts
  Content-Type: application/x-mudanzapp-photos
  body: <uint32 BE headerLength><header JSON UTF-8><blob 1><blob 2>…
        header = { "photos": [ { "contentType": "image/webp", "byteLength": 1234 }, … ] }

  200 { draft: { title, note } }
  400 validation_failed      // cabecera mal formada, longitudes incoherentes, bytes de más o de menos
  400 photo_invalid          // tipo no admitido, parte vacía, cantidad fuera de 1..6, total sobre el tope
  401 unauthorized
  404 not_found              // evento ajeno o inexistente, igual que hoy
```

### El framing

- `encodePhotoBundle(photos)` y `decodePhotoBundle(bytes)` en un módulo puro de `shared`, con la misma
  forma que consumen cliente y servidor. **Una sola fuente** para el formato.
- Orden: el arreglo del header y los blobs van en el orden del arreglo. **El índice es el orden**; no
  se publica `position` dentro del bundle.
- Límites declarados en `AI_DRAFT_LIMITS` ([`shared/src/ai.ts`](../shared/src/ai.ts:20)):
  `photos: 6` —el tope duro, no el del nivel— y `bundleBytes`.
- El decodificador rechaza: cabecera de más de 1 KiB, cantidad fuera de `1..6`, parte de `byteLength`
  cero, suma que no cuadra con el total y bytes sobrantes al final. Falla ruidoso, no «repara».

### El lector compartido

[`readPhotoBody()`](../backend/src/routes/raw-body.ts:34) pasa a aceptar un tope por parámetro, con el
actual como valor por defecto. Una sola regla de transporte para las tres rutas que reciben cuerpos
binarios.

### La costura del proveedor

```text
draft({ photos: readonly { bytes, contentType }[] })   // 1 o 2 partes en la práctica
```

- `live` compone **una parte `inline_data` por foto** en la misma llamada, en el orden recibido.
- `fake` es determinista sobre el **bundle completo** (hash del encadenado y del conteo), no sobre la
  primera foto, para que dos fotos produzcan un borrador distinto de una y el e2e no dependa del azar.
- El prompt dice explícitamente que las fotos son el mismo artículo desde ángulos distintos. Sin esa
  frase el modelo puede describirlas como artículos separados.
- La validación de salida (`aiDraftSchema`) no cambia: el modelo sigue produciendo solo título y nota.

## 5. Superficies y UI

Solo la tira del panel de captura, que ya existe desde 3e:

- Contador: `n de m fotos al borrador`, con `n = min(galería, tope)` y `m = galería`. Con dos fotos y
  tope 2 dice `2 de 2`; con cuatro fotos y tope 2, `2 de 4`; con tres fotos y tope 2, `2 de 3`. El
  denominador es la tira —lo que la persona tiene— porque eso es lo que explica la línea siguiente.
- Una línea cuando el máximo es menor que la galería:
  `El borrador usa hasta 2 fotos: las 2 primeras.` Sin la palabra «nivel», sin modal y sin globo
  (inclinaciones 6 y 10). La capacidad se nombra, el nivel no.
- El botón no cambia de rótulo; el contador ya dice qué va a leer. Nada se oculta en ningún nivel
  (inclinación 4: se promueve, no se restringe).
- Con una sola foto, el contador no aparece: no hay nada que explicar y sería ruido.
- Error del borrador: se conservan los mensajes actuales (`AI_NOT_CONFIGURED`, `AI_OUTPUT_INVALID`,
  `AI_UNAVAILABLE`, `PHOTO_INVALID`); el humano sigue pudiendo escribir y publicar sin el borrador.

## 6. Cambios por archivo

| Archivo                                                                                                 | Cambio                                                        | Por qué sirve a la hipótesis                    |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `shared/src/photo-bundle.ts`                                                                            | Nuevo: codificar y decodificar el bundle, con sus límites     | Es el formato del corte, en una sola fuente     |
| [`shared/src/ai.ts`](../shared/src/ai.ts:20)                                                            | `AI_DRAFT_LIMITS.photos` y `bundleBytes`; docblock del cuerpo | Los topes viven donde ya viven los del borrador |
| [`shared/src/index.ts`](../shared/src/index.ts:1)                                                       | Exporta el módulo nuevo                                       | Punto único de importación                      |
| [`backend/src/routes/raw-body.ts`](../backend/src/routes/raw-body.ts:34)                                | Tope por parámetro, con el actual por defecto                 | Una regla de transporte, no tres                |
| [`backend/src/routes/ai-router.ts`](../backend/src/routes/ai-router.ts:50)                              | Decodifica el bundle, valida y pasa `photos` a la costura     | La ruta sigue sin conocer artículo ni base      |
| [`backend/src/ai/draft-provider.ts`](../backend/src/ai/draft-provider.ts:1)                             | `draft({ photos })`                                           | La costura cambia una vez para los dos modos    |
| `backend/src/ai/gemini-draft.ts`                                                                        | Una parte `inline_data` por foto                              | Es lo que el proveedor acepta                   |
| `backend/src/ai/gemini-fake.ts`                                                                         | Determinista sobre el bundle completo                         | El e2e distingue una de dos fotos               |
| `backend/src/ai/prompt.ts`                                                                              | Frase de «mismo artículo desde varios ángulos»                | Evita que el modelo describa varios artículos   |
| [`frontend/src/app/items/item-form.component.ts`](../frontend/src/app/items/item-form.component.ts:331) | Arma el bundle con las primeras N medianas y lo envía         | El orden de la tira es el orden del bundle      |
| `frontend/src/app/items/photo-gallery.component.html`                                                   | Contador y línea de capacidad                                 | La pantalla dice qué va a leer el modelo        |
| [`e2e/ai-draft.spec.ts`](../e2e/ai-draft.spec.ts:1)                                                     | Nivel 0 frente a nivel 1                                      | La evidencia del corte                          |

## 7. Evidencia

Unidad (`shared` y backend, Vitest):

- Ida y vuelta del bundle con una, dos y seis fotos: bytes idénticos y mismo orden.
- Rechazo por cabecera corrupta, por cantidad `0` y `7`, por `byteLength` que no suma, por bytes
  sobrantes y por total sobre `bundleBytes`.
- El proveedor recibe **exactamente N partes, en el orden del bundle** (proveedor de prueba que
  registra lo que recibe).
- El `fake` con dos fotos produce un borrador distinto del de una sola.

e2e, con `AI_MODE=fake`:

- Nivel 0 con tres fotos tomadas: el contador dice `1 de 3` y el borrador vuelve.
- Nivel 1 con tres fotos tomadas: el contador dice `2 de 3`, la línea nombra las dos primeras, y el
  borrador vuelve distinto del de una sola foto (prueba de que el bundle llegó completo).
- Una sola foto: sin contador y con el recorrido de hoy intacto.

Revisión `live` (no la puede pagar el gate): la calidad del texto con dos fotos, registrada como en
[`plan-ciclo-3d` §17](plan-ciclo-3d-borrador-ia.md:470), sin transcribir el borrador ni el prompt.

Gate proporcional (uno por invocación, una corrida a la vez):

- `npm run typecheck`, `npm run lint`, `npm run format:check`
- `npm run test:web:frontend` y `npm run test:web:shop` (`shared` tocado)
- `npm run build:web:frontend` y `npm run build:web:shop`
- `npm run test:api:db:branch`
- `npm run typecheck:e2e` y `npm run test:e2e:branch`

## 8. Orden de implementación

1. Promoción en `resumen-funcional` §3 y §4; fila 3i en el backlog; este plan escrito.
2. `shared/src/photo-bundle.ts` con sus unit, antes de tocar la ruta.
3. `AI_DRAFT_LIMITS` y el lector con tope parametrizado.
4. `ai-router` decodificando y validando; la ruta sigue sin base ni almacén.
5. Costura del proveedor: tipo, `live`, `fake` y prompt.
6. Cliente: primeras N medianas en orden, contador y línea.
7. Pruebas de backend con proveedor que registra, y e2e.
8. Gate, commit `feat(ai)`, delta del wiki y revisión `live` del texto.

## 9. Rama, base y entrega

- **Rama:** `_branch`; base local `mudanzapp_branch` y `_branch_test`.
- **Migraciones:** ninguna. El gate de e2e corre igual sus comandos de esquema.
- **Si la revisión contradice la hipótesis** (el texto no mejora con dos fotos): el corte se queda en
  la dev branch, el hallazgo va a la bandeja y la tabla de `photosForLevel` puede volver a 1 en un
  corte propio. El bundle y el framing no se tiran: son el transporte que cualquier número de fotos
  necesita.
- **Commit:** `feat(ai)` con hipótesis, corte y evidencia, más la línea de wiki.

## 10. Correcciones de fuente que el corte exige

| Archivo                                                                 | Sección             | Corrección                                                                                                                                                       |
| ----------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:145) | §4, fila `ai-draft` | «La mediana» deja de ser el único insumo: el borrador lee hasta dos fotos en el orden de captura, según el nivel de la mudanza; el resto de la fila sigue cierto |
| [`shared/src/ai.ts`](../shared/src/ai.ts:5)                             | docblock            | El cuerpo deja de ser una imagen única y pasa a ser un bundle acotado                                                                                            |
| [`ai-router.ts`](../backend/src/routes/ai-router.ts:14)                 | docblock            | «Recibe la variante `medium`» pasa a «recibe hasta N fotos en orden»; la ruta sigue sin artículo, sin base y sin almacén                                         |
| [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:101)            | §3                  | La fila que menciona el worker se cierra aquí en su parte de contexto remoto; el worker queda en 3f                                                              |

## 11. Riesgos y disparadores

| Riesgo                                                      | Qué lo dispara                                                 | Qué se hará                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Dos fotos no mejoran el texto                               | La revisión `live` del corte                                   | Se registra el resultado; la tabla vuelve a 1 en su propio corte y el transporte queda      |
| Latencia y tokens crecen más de lo tolerable en un teléfono | Un borrador que pasa de unos pocos segundos a una espera clara | Bajar el tamaño de la segunda parte o volver a 1; medir antes de tocar el prompt            |
| El prompt describe dos artículos                            | Un borrador que habla en plural o separa                       | Endurecer la instrucción y las pruebas del prompt; el contrato no cambia                    |
| El bundle coincide en tamaño con un abuso                   | Un cuerpo cercano a `bundleBytes` en producción                | El tope ya lo rechaza; si se repite, se agrega cuota (C4) con su decisión                   |
| El `fake` cambia y deja e2e inestable                       | Un borrador que cambia entre corridas con el mismo bundle      | El hash es del encadenado completo; se corrige en el doble, nunca en el e2e                 |
| El cliente envía más fotos que las que el nivel permite     | Un cambio futuro en la tabla o un cliente viejo                | No es un defecto del borde: se acepta hasta el tope duro de 6 y la captura es la que decide |

## 12. Alternativas evaluadas

| Alternativa                                   | Por qué se descartó                                                             | Qué la reabriría                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| JSON con base64                               | Infla un tercio y contradice la elección de 3d de no usar base64 en la frontera | Un cliente que no pueda emitir binario                      |
| `multipart/form-data` con `busboy` o `multer` | Dependencia nueva, con su aprobación y su commit `deps`                         | Un navegador que impida el cuerpo binario armado a mano     |
| Que el backend lea las fotos del almacén      | Es B2, descartada en 4g §13, y obliga a que la ruta conozca el artículo         | Un ciclo que ya tenga el artículo creado antes del borrador |
| Una llamada al modelo por foto                | Multiplica costo y latencia y no compone contexto                               | Nada                                                        |
| Guardar el conjunto enviado para repetirlo    | Un registro de la IA, contra §34                                                | Un requisito real de reconsultar con el mismo conjunto      |

## 13. Cierre

**Fecha:** 2026-11-13 (04:50 UTC). **Sha:** `827fcc2` (`feat(ai)`) en `main`. **Migraciones:**
ninguna.

Evidencia observada (gate local, una corrida por comando):

- `npm run typecheck` en verde en los cinco workspaces, incluido `e2e`.
- `npm run test:api`: 39 archivos y 304 pruebas. Nuevas: ida y vuelta del bundle con 1, 2 y 6 fotos
  más los seis rechazos del decodificador (`test/domain/photo-bundle.test.ts`, 10 pruebas), la
  frontera con un proveedor que **registra** las fotos en orden (`test/routes/ai-draft.test.ts`, 5),
  las dos fotos como dos `inline_data` en una sola llamada (`test/ai/gemini-draft.test.ts`) y el
  `fake` que distingue una de dos fotos (`test/ai/draft-provider.test.ts`).
- `npm run test:web:frontend`: 33 archivos y 238 pruebas, con el contador `1 de 3` en nivel 0, `2 de 3`
  en nivel 1, la línea de capacidad y el bundle decodificado desde el cuerpo que envía el formulario.
- `npm run test:web:shop` (70), `npm run test:web:wiki` (13), `npm run build`, `build:web:frontend`,
  `build:web:shop`, `build:web:wiki`, `npm run lint` y `npm run format:check`, en verde.
- `npm run test:api:db:branch` sobre la base derivada `_branch_test`: 50 archivos y 333 pruebas.
- `npm run typecheck:e2e` y `npm run test:e2e:branch`: **29 pasadas y 52 omitidas** —las suites de
  `frontend` se omiten en los `project` de `shop` y `wiki`—, con las cuatro de `ai-draft.spec.ts` en
  verde: el sobre llega entero (un borrador con `2 fotos` distinto del de `1 foto`), el borde rechaza
  el sobre roto con `validation_failed` y el cuerpo excedido con `photo_invalid`, y la tira dice
  `1 de 3` en nivel 0 y `2 de 3` con la línea de las dos primeras en nivel 1.

**Dos rojos que no ejercieron el corte, corregidos en la corrida:**

- La primera corrida del arnés falló con `bundle_photo_invalid` porque la prueba declaraba
  `image/png` como tipo de una parte; `image/png` es el archivo de la cámara y no una variante que el
  almacén admita. El arreglo fue declarar `image/webp`, y el rechazo es el comportamiento correcto.
- La segunda falló en `enterCapture` con la URL quieta en `/inicio`: el caché de dependencias de
  Vite servía un `@mudanzapp/shared` **sin** los exports nuevos
  (`does not provide an export named 'PHOTO_BUNDLE_CONTENT_TYPE'`). Se limpió
  `frontend/.angular/cache` y la corrida siguiente quedó en verde, según la regla del gate.

**Corrección registrada al ejecutar:** §5 fijaba el denominador en el tope del nivel y §7 esperaba
`2 de 3` con tres fotos; las dos frases no podían cumplirse a la vez. Se fijó el denominador en la
galería (`n de m`, `m = galería`), que es lo único que explica la línea de capacidad, y las dos
formulaciones quedaron alineadas en §5 y §7. El nivel 0 con tres fotos dice `1 de 3`; el ejemplo
`1 de 1` de §7 suponía una galería de una foto, donde §5 no muestra contador.

**Decisión del dueño (2026-11-13):** no se verifica `live` en remoto. Los resultados del gate local
se aceptan como suficientes, así que §14 queda **no ejecutada** y aquí no se anota ninguna calidad del
texto. El costo aceptado se declara: la hipótesis se apoya en el contrato, en la base y en el doble
determinista, no en una llamada real al proveedor con dos partes.

**Pendiente con su disparador:**

- La latencia con dos partes en un teléfono no se midió. Disparador: la primera queja de espera en la
  captura; se mide antes de tocar el prompt (§11).
- Si el texto con dos fotos decepciona en uso real, el corte se queda y la tabla de `photosForLevel`
  vuelve a 1 en su propio corte (§9); el bundle y el framing no se tiran.

## 14. Prueba `live` en remoto (paso manual del dueño)

> **No ejecutada.** El dueño decidió el 2026-11-13 no verificarla en remoto y aceptar el gate local
> (§13). Los pasos quedan como referencia para cuando se quiera pagar esa prueba.

Sin migración en este corte.

1. Desplegar la rama según `Man-3.4`, con `AI_MODE=live` como ya está en el servicio.
2. En un evento con **0 a 2** artículos publicados: capturar un artículo con una foto y pedir el
   borrador. El contador no aparece y el texto debe ser el de siempre.
3. En `/cuenta`, subir el nivel y recargar. Capturar un artículo con tres fotos: la tira debe decir
   `2 de 3 fotos al borrador` y la línea debe nombrar las dos primeras. Pedir el borrador y leer el
   texto.
4. Publicar tres artículos en ese evento y recargar `/cuenta`: el nivel es 1 por evidencia y el tope
   sigue en 2 fotos. Es lo esperado.
5. Lo que solo `live` prueba: que el proveedor acepta dos partes en una llamada y cuánto tarda en un
   teléfono. Anotar la espera percibida y si el texto distingue detalles que con una foto no aparecían;
   no transcribir el borrador.
