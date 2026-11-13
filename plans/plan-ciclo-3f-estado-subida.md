# Plan del ciclo 3f — `photo-upload-state`: cada foto dice en qué estado está y se reintenta sin recodificar

> **Estado:** **plan ejecutable, sin ejecutar.** Ninguna rama abierta, ninguna migración aplicada y
> ningún commit.
> **Hipótesis:** con seis fotos, el panel puede decir por foto qué está en el teléfono, qué ya subió y
> qué falló, y reintentar solo la que falló reenviando los mismos bytes.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:66) §3 y §4 (fila por
> promover); [`backlog`](backlog-funcionalidades-pendientes.md:75) fila A2;
> [`plan-ciclo-3d`](plan-ciclo-3d-borrador-ia.md:498) §18;
> [`plan-ciclo-4g`](plan-ciclo-4g-direct-upload.md:1) §5;
> [`referencia-ux-ui`](referencia-ux-ui.md:8) inclinaciones 5, 6, 9 y 11.

## 0. Hecho o decisión que abre el corte

| Pregunta                              | Respuesta del dueño                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ¿Qué estados se ven por foto?         | `local` frente a `uploaded`, más el fallo. El estado vive en el componente y en la sesión, **no en la base**.  |
| ¿El reintento recodifica?             | **No.** Reenvía los mismos bytes ya optimizados.                                                               |
| ¿El optimizador se mueve a un worker? | **Solo si la medición lo pide.** El disparador declarado es una captura de seis fotos que congele la interfaz. |
| ¿Dónde se ve el fallo?                | Dentro del panel de captura, por foto. Nunca en el aterrizaje ni como aviso global.                            |

## 1. Hipótesis y corte

- **Qué compra:** la tira dice la verdad por foto —optimizando, en el teléfono, subiendo, subida,
  fallida—, el reintento reenvía los mismos bytes y solo de la foto que falló, y publicar deja de ser
  un todo-o-nada cuando una foto posterior falla.
- **Qué no compra:** cola, trabajo en segundo plano, reanudación tras recargar, persistencia del
  estado, contrato nuevo, endpoint nuevo, ni cambios en el almacén.
- **Costo declarado:** refactor del pipeline extraído en 3e, la tira y su modelo de estado, el
  reintento por foto y el e2e con un fallo inyectado. **Sin migración y sin dependencias nuevas.**
  Depends de **3e**.
- **Gate para abrir:** la revisión `live` de 3e debe registrar el disparador: re-optimizar seis fotos
  al volver al panel y si eso se siente como una congelación. Sin ese registro, el corte no se abre.

## 2. Fuera de este corte

- Reanudar una subida después de cerrar la pestaña: no hay persistencia y no la habrá aquí.
- Subida en segundo plano, cola o `Background Sync`.
- Reintento automático con retroceso. El reintento es un acto del humano y se ve.
- Persistir el estado en la base o en `localStorage`.
- Cambiar el progreso ponderado por bytes de la tanda activa: sigue siendo la medida honesta de la
  transferencia (inclinación 11 aplica al estado de la galería, no al porcentaje de una subida).
- Un worker si la medición no lo justifica: en ese caso se declara el resultado y se cierra el corte
  sin él.

## 3. Datos

**Ninguno.** El estado por foto es de la visita y muere con la pestaña, igual que la sesión de captura
desde D13.

## 4. Contrato

**Sin cambios.** La adjunción ya acepta una o varias capturas con su `slot`; este corte la usa de a
una para que el estado sea por foto. Ningún código estable nuevo.

## 5. Superficies y UI

Solo la tira del panel de captura, con estos estados y su lectura:

| Estado       | Qué se ve                                           | Qué se puede hacer        |
| ------------ | --------------------------------------------------- | ------------------------- |
| `optimizing` | la miniatura con un marcador de trabajo             | nada en esa foto          |
| `local`      | `En el teléfono`                                    | quitarla antes de guardar |
| `uploading`  | el progreso ponderado de **esa** foto               | nada en esa foto          |
| `uploaded`   | `Subida`                                            | reordenarla               |
| `failed`     | `No subió` y un botón `Reintentar` en la misma foto | reintentar solo esa       |

Reglas:

- Contador de la galería: `4 listas, 2 en el teléfono`. Nunca un porcentaje agregado de la galería.
- El fallo vive en la foto y en el panel; no aparece en `/inicio` ni como aviso de ruta
  (inclinación 9).
- `Reintentar` reenvía los mismos `Blob` y el mismo ticket mientras siga vigente; si caducó, pide uno
  nuevo con los mismos bytes. Nunca vuelve a optimizar.
- **Publicar exige la portada subida** (índice 0), porque la miniatura de la lista y la ficha pública
  leen esa posición. Un fallo en una foto posterior no bloquea publicar, pero queda visible y
  reintentable.
- Guardar sin ninguna foto subida sigue siendo posible, como hoy: el artículo queda sin foto y la
  lista lo dice.
- La barra inferior no cambia de forma ni de orden (inclinación 5).

## 6. Cambios por archivo

| Archivo                                                                                                 | Cambio                                                                     | Por qué sirve a la hipótesis           |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| `frontend/src/app/items/photo-pipeline.ts`                                                              | Máquina de estado por foto y adjunción de a una                            | Es la costura que el corte refactoriza |
| [`frontend/src/app/items/photo-upload.ts`](../frontend/src/app/items/photo-upload.ts:108)               | El progreso se reporta por foto y por variante, sin cambiar la ponderación | El porcentaje sigue siendo honesto     |
| [`frontend/src/app/items/item-form.component.ts`](../frontend/src/app/items/item-form.component.ts:386) | `retryPhoto` pasa a reintentar por foto; `send` adjunta por foto           | Hoy el reintento es de la tanda entera |
| `frontend/src/app/items/photo-gallery.component.ts` y `.html`                                           | Estado por casilla y `Reintentar` en la fallida                            | La superficie del corte                |
| [`e2e/photos.spec.ts`](../e2e/photos.spec.ts:1)                                                         | Fallo inyectado en un `PUT` y reintento                                    | La evidencia del corte                 |
| `e2e/support/attach-capture.ts`                                                                         | Sin cambios                                                                | La costura de pruebas se reutiliza     |

## 7. Evidencia

e2e, con `page.route` abortando el `PUT` de la **segunda** foto de una tanda de tres:

- La segunda foto queda `failed` y las otras dos `uploaded`; el contador lo refleja.
- `Reintentar` se ofrece solo en la fallida y el reintento completa la galería.
- **Las fotos ya subidas no se reenvían**: el número de peticiones `PUT` de las otras no crece.
- El fallo no navega, no cierra la sesión y no aparece en `/inicio`.
- Publicar con la portada subida y una foto posterior fallida completa la publicación; la foto
  fallida sigue reintentable.
- Publicar con la portada fallida no publica y lo dice en la foto; reintentar la portada y publicar
  sí funciona.

Unidad:

- La máquina de estado no permite `uploaded` sin `uploading` previo ni dos `uploading` simultáneos de
  la misma foto.
- Reintentar una foto `failed` reutiliza los mismos `Blob` (identidad por referencia en la prueba).

Gate proporcional (uno por invocación, una corrida a la vez):

- `npm run typecheck`, `npm run lint`, `npm run format:check`
- `npm run test:web:frontend` y `npm run build:web:frontend` (`shared` no se toca)
- `npm run test:e2e:branch`

## 8. Orden de implementación

1. Promoción en `resumen-funcional` §3 y §4; fila A2 del backlog a `planeada`; este plan escrito con
   el registro de la medición de 3e en §0.
2. Máquina de estado en el pipeline, con sus unit.
3. Adjunción por foto y reintento por foto en el formulario.
4. Tira con estado y `Reintentar`.
5. Fallo inyectado en el e2e.
6. Gate y commit `feat(web)`.
7. **Solo si la medición lo pidió:** el worker, en su propio commit `perf(web)` con la medición en el
   cuerpo.

## 9. Rama, base y entrega

- **Rama:** `_branch`; base local `mudanzapp_branch` y `_branch_test`.
- **Migraciones:** ninguna.
- **Si la revisión contradice la hipótesis** (el estado por foto no cambia nada porque las subidas no
  fallan): el corte no se integra y el hallazgo va a la bandeja. El worker se decide por su cuenta y
  con su medición.
- **Commit:** `feat(web)`; el worker, si existe, en `perf(web)`.

## 10. Correcciones de fuente que el corte exige

| Archivo                                                                 | Sección            | Corrección                                                                                   |
| ----------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:143) | §4, fila `capture` | El progreso deja de ser solo del guardado: cada foto publica su estado y su reintento        |
| [`estructura-ui`](estructura-ui-navegacion-mudanzapp.md:101)            | §3                 | La parte de «compresión en worker» de esa fila se cierra o se descarta aquí, con la medición |

## 11. Riesgos y disparadores

| Riesgo                                                            | Qué lo dispara                                       | Qué se hará                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| El ticket caduca a mitad de un reintento largo                    | Un `403` del almacén al reintentar                   | Ya existe el margen de 60 s; si no basta, se pide ticket nuevo con los mismos bytes       |
| Reintentar reenvía toda la tanda y el estado miente               | Un conteo de peticiones mayor al esperado en el e2e  | La adjunción por foto es la regla; el e2e lo afirma con el conteo                         |
| El fallo inyectado no reproduce el fallo real (CORS, red móvil)   | Un fallo en `live` que el e2e no cubre               | El mensaje distingue el bloqueo del navegador del rechazo del almacén, como ya declaró 4g |
| El worker duplica la superficie del optimizador                   | El primer rojo de un navegador sin `OffscreenCanvas` | Caída a hilo principal declarada y probada; si no, no se abre el commit `perf`            |
| Publicar con la portada fallida deja un artículo sin foto visible | Un caso real en `live`                               | Ya está previsto: no se publica y el mensaje vive en la foto                              |

## 12. Alternativas evaluadas

| Alternativa                        | Por qué se descartó                                                  | Qué la reabriría                       |
| ---------------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| Un estado agregado de la galería   | No dice cuál falló, que es todo el punto                             | Nada                                   |
| Persistir el estado en la base     | Un estado de interfaz no es un hecho del producto                    | Un requisito de reanudar tras recargar |
| Reintento automático con retroceso | Esconde el fallo y consume datos del teléfono                        | Un caso de red intermitente medido     |
| Worker desde el principio          | Es una solución a un problema no medido, con costo de compatibilidad | La medición de 3e                      |

## 13. Cierre

Se escribe al cerrar: fecha, sha corto, evidencia observada, resultado de la medición y lo que quede
pendiente con su disparador.

## 14. Prueba `live` en remoto (paso manual del dueño)

Sin migración en este corte.

1. Desplegar la rama según `Man-3.4`.
2. En el teléfono, con señal móvil normal, capturar cuatro fotos y guardar. La tira debe pasar por
   `En el teléfono` y `Subida` foto por foto, sin porcentaje agregado.
3. Repetir con el teléfono en modo avión justo después de pulsar guardar: lo esperado es que las fotos
   ya subidas queden en `Subida` y las demás en `No subió`, con `Reintentar` en cada una. Recuperar la
   señal y reintentar: las que ya estaban no deben volver a empezar.
4. Publicar con una foto posterior fallida: la publicación debe completarse y el fallo quedar visible
   en la tira.
5. Lo que solo un dispositivo prueba: una caída real de 4G a mitad de la tanda, y si el panel sigue
   respondiendo al tocar mientras las fotos viajan. Si se siente congelado, anotar en qué momento: es
   la medición que decide el worker.
