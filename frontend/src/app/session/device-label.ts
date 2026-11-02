/** Límite del contrato (`deviceLabel` en `shared/src/identity.ts`). */
const DEVICE_LABEL_MAX = 80;

/**
 * Etiqueta del dispositivo que viaja con la sesión: el agente del navegador, truncado al límite del
 * contrato. No identifica a nadie: sirve para que la persona reconozca su propio dispositivo en una
 * lista. La usan el canje y el reclamo, que emiten sesiones en el mismo sitio.
 */
export function deviceLabel(): string {
  return globalThis.navigator.userAgent.slice(0, DEVICE_LABEL_MAX);
}
