# Plan del ciclo <ID> — `<slug>`: <hipótesis en una línea>

> **Estado:** **plan ejecutable, sin ejecutar.** Ninguna rama abierta, ninguna migración aplicada y
> ningún commit.
> **Hipótesis:** <una frase que se pueda refutar con evidencia>.
> **Fuentes:** [`resumen-funcional`](../.plans/resumen-funcional-app-mudanzapp.md:1) §<n>;
> [`backlog`](backlog-funcionalidades-pendientes.md:1) fila <ID>;
> [`decisiones`](../.plans/decisiones-tecnicas-app-mudanzapp.md:1) §<n>;
> [`modelo-datos`](../.plans/modelo-datos-app-mudanzapp.md:1) §<n>.

## Cómo se usa esta plantilla

1. Copiar a `plans/plan-ciclo-<id>-<slug>.md`. Cuando exista `ciclo:new` lo hace, y solo si el corte
   ya está declarado ([`workflow-ciclos`](workflow-ciclos.md:1) §4).
2. Borrar las secciones opcionales que no apliquen. **Nunca** borrar una obligatoria.
3. Una sección obligatoria sin contenido es un motivo para no abrir el ciclo, no para dejarla vacía.
4. El plan es ejecutable y **no autorizado** hasta que el dueño lo apruebe
   (`.roo/rules-orchestrator/00-workflow.md`).

## 0. Hecho o decisión que abre el corte (opcional)

<!-- Solo si el corte nace de un hallazgo, de una revisión `live` o de una decisión del dueño.
     Una tabla pregunta → respuesta, fechada, como en los planes de 4e y 4g. -->

## 1. Hipótesis y corte (obligatoria)

<!-- Una frase de hipótesis y el corte vertical que la pone a prueba. -->

- **Qué compra:** <el hecho nuevo que queda demostrado>.
- **Qué no compra:** <lo que queda fuera, aunque sea tentador>.
- **Costo declarado:** <superficies, migraciones, rutas, dependencias>. **Sin dependencias nuevas** o
  el commit `deps` que las introduce.

## 2. Fuera de este corte (obligatoria)

<!-- Lista explícita. Todo lo que el lector podría suponer incluido y no lo está. -->

## 3. Datos (opcional)

<!-- Solo si toca esquema. Archivo `backend/sql/<NNN>_<slug>.sql`, número reservado en el backlog,
     aditivo, idempotente y sin DROP. Qué tabla o columna, por qué es un hecho y no un estado. -->

## 4. Contrato (opcional)

<!-- Solo si expone o cambia HTTP. Rutas con sus códigos estables. Nada inventado:
     todo contrato es hipótesis hasta la primera corrida real (.guidelines/07 §7). -->

```text
GET /ruta
200 { forma }
401 unauthorized | 404 not_found
```

## 5. Superficies y UI (opcional)

<!-- Solo si hay interfaz. Ruta, guarda, componente, estados vacío y de error,
     y qué ve cada rol. Plantillas en archivos `.html` separados. -->

## 6. Cambios por archivo (obligatoria)

| Archivo  | Cambio        | Por qué               |
| -------- | ------------- | --------------------- |
| `<ruta>` | <qué se hace> | <qué hipótesis sirve> |

## 7. Evidencia (obligatoria)

<!-- La prueba que responde la hipótesis. Si el corte no existe, la prueba falla.
     Comandos del gate proporcional en `workflow-ciclos` §7. -->

- <aserción ejecutable 1>
- <aserción ejecutable 2>

## 8. Orden de implementación (obligatoria)

1. <paso>
2. <paso>

## 9. Rama, base y entrega (obligatoria)

<!-- Dónde vive la experimentación, qué migraciones se aplican y en qué destino,
     y qué queda sin integrar si la revisión contradice la hipótesis. -->

## 10. Correcciones de fuente que el corte exige (opcional)

<!-- Solo si un documento contradice el código o la decisión. Archivo, sección y corrección.
     Si es grande, es su propio corte `doc`. -->

## 11. Riesgos y disparadores (obligatoria)

| Riesgo   | Qué lo dispara              | Qué se hará        |
| -------- | --------------------------- | ------------------ |
| <riesgo> | <evidencia que lo enciende> | <corte o decisión> |

## 12. Alternativas evaluadas (opcional)

<!-- Solo si hubo una decisión real. Alternativa, por qué se descartó y qué la reabriría. -->

## 13. Cierre (se escribe al cerrar)

<!-- Fecha, sha corto, evidencia observada, revisión `live` si aplica y qué quedó pendiente
     con su disparador. No se reescribe lo anterior. -->

## Variante spike

Un spike responde una incógnita acotada y no cierra un corte de producto. Máximo una página y solo
tres secciones: **1** hipótesis y corte, **7** evidencia y **11** riesgos. Sin datos, sin contrato, sin
topología y sin §13: el resultado se registra en la bandeja o en el plan del ciclo que lo use.
