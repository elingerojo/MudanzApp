import { DEVICE_LABEL_MAX } from '@mudanzapp/shared';

/**
 * Etiqueta del dispositivo que viaja con la sesión de tienda: el agente del navegador, truncado al
 * límite del contrato. No identifica a nadie; sirve para reconocer el propio dispositivo.
 */
export function deviceLabel(): string {
  return globalThis.navigator.userAgent.slice(0, DEVICE_LABEL_MAX);
}
