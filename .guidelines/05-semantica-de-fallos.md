# 05 — Semántica de fallos

En 0 → 1, un fallo silencioso enseña mal. El sistema debe fallar de forma visible y dejar evidencia para el siguiente ciclo.

## 1. Liveness no es readiness

- El healthcheck de proceso reporta que el proceso está vivo y no devuelve 5xx: una base caída no debe reiniciar un proceso sano.
- El healthcheck de dependencia reporta si la base es usable y devuelve 503 cuando no lo es.
- La plataforma reacciona distinto a cada señal; no las mezcles.

## 2. Falla ruidosamente donde el silencio es peligroso

- Configuración incompleta, base de pruebas ausente o estado imposible: falla con un código estable y un mensaje visible.
- No saltes pruebas en silencio ni degradas a un estado incorrecto.
- Un fallo silencioso corrompe el ciclo de aprendizaje.

## 3. Falla con evidencia

- Todo fallo deja contexto suficiente para reproducirlo: operación, forma del input (sin datos sensibles), dependencia y código de error.
- La evidencia no filtra credenciales, payloads sensibles ni cuerpos crudos.
- Un fallo que no deja evidencia es un fallo que se repetirá.

## 4. Degradación visible y acotada

- Si el producto puede continuar, degrada, pero haz visible la degradación y acótala.
- Nunca degradas en silencio.
- Si no puedes continuar con seguridad, falla.

## 5. Errores estables en el borde

- El error que cruza la frontera es estable y tipado: código, mensaje y detalles de campo.
- El cliente ramifica por `code`, no por el mensaje.
- El detalle interno se queda en la evidencia, no en la respuesta.
