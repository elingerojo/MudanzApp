# 02 — Verdad y contratos

En un producto 0 → 1, la verdad debe ser explícita pero provisional.

## 1. Una fuente por hecho, no un monolito

Cada hecho tiene una sola ubicación autoritativa: el nombre público, un término del dominio, la forma de un payload, un código de error.

- Si dos lugares discrepan, uno está mal y debe desaparecer.
- La fuente puede ser un documento, un esquema o un archivo de configuración; lo importante es que sea singular.
- No confundas "una fuente por hecho" con "un documento gigante para todo".

## 2. Contrato mínimo y provisional

El contrato vive en el centro del corte vertical, pero es el artefacto más delgado que permite integrar el siguiente paso: tipos, esquema de validación, forma del payload y códigos de error.

- Un spike puede no tener contrato; un corte vertical sí debe tenerlo.
- Marca el contrato como provisional y revísalo cuando la revisión contradiga la hipótesis.
- No construyas un contrato exhaustivo antes de entender el dominio.

## 3. Valida en la frontera

Valida en el borde HTTP y en la salida de toda integración externa.

- Nunca confíes en datos externos.
- La validación protege el ciclo de aprendizaje de datos corruptos; no sustituye las reglas del dominio.
- Un dato inválido debe fallar con un error estable, no entrar al sistema.

## 4. Identificadores estables en el borde

Los códigos de error son parte del contrato.

- El cliente ramifica por `code`, nunca por el mensaje.
- En 0→1 los códigos pueden evolucionar, pero el cambio se hace en la fuente y se refleja en el contrato.

## 5. Un dueño por hecho

Cada hecho tiene un dueño (rol) y un disparador de revisión.

- La documentación es un conjunto de hechos con dueño, no un vertedero.
- Cuando un hecho cambia, se actualiza la fuente y se avisa a los consumidores.
