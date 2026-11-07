import type { EventSummary } from '@mudanzapp/shared';

/**
 * El trayecto del evento en una línea: `origen → destino` (corte D9).
 *
 * Lo publican el contexto de las pantallas raíz y la pantalla de `Cuenta`; vive aquí para que el
 * mismo hecho no se componga dos veces con dos formatos distintos.
 */
export function eventTitle(event: EventSummary): string {
  return `${event.originCity} → ${event.destinationCity}`;
}
