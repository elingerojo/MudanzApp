import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { CartRequestSummary } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../api-base-url.token';
import { FORBIDDEN, apiErrorCode } from '../../session/api-error';

/** Mensaje de un fallo al descartar, ramificado por `code` y nunca por el texto del borde. */
function dismissMessage(code: string | null): string {
  return code === FORBIDDEN
    ? 'No puedes descartar solicitudes de este evento.'
    : 'No se pudo descartar la solicitud. Inténtalo de nuevo.';
}

/**
 * Las solicitudes de carrito del evento (ciclo 4e, `cart-request`).
 *
 * Tiene su **propia** lectura y no viaja en el panel del dashboard: la lista crece con cada pedido y su
 * ciclo de vida es distinto —se relee al enfocar la ventana y después de descartar—, mientras que la
 * lectura del panel es la que autoriza la ruta. Es la misma separación que `Capturas` con su recurso de
 * artículos (`plan-ciclo-4c-event-admin` §6).
 *
 * Los fallos **no** se cachean: un evento recién reclamado debe poder abrir la lista sin recargar.
 */
@Injectable({ providedIn: 'root' })
export class CartRequestsStore {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** El evento de la sección: lo fija la pantalla al activarse. */
  private readonly eventId = signal<string | null>(null);

  private readonly resource = httpResource<{ readonly requests: readonly CartRequestSummary[] }>(
    () => {
      const eventId = this.eventId();
      return eventId === null ? undefined : `${this.apiBaseUrl}/events/${eventId}/cart-requests`;
    },
  );

  readonly requests = computed<readonly CartRequestSummary[]>(() =>
    this.resource.status() === 'resolved' ? (this.resource.value()?.requests ?? []) : [],
  );

  readonly loading = this.resource.isLoading;
  readonly failed = computed(() => this.resource.status() === 'error');

  /** Solicitud cuyo descarte está en vuelo; mientras haya una, ningún botón se repite. */
  readonly dismissingId = signal<string | null>(null);

  /** Último fallo del acto, con su frase; no tiñe el resto del panel. */
  readonly failure = signal<string | null>(null);

  /** Fija el evento de la lectura. Llamarlo dos veces con el mismo id no vuelve a pedir nada. */
  load(eventId: string): void {
    this.eventId.set(eventId);
  }

  /**
   * Relee el hecho. El panel no tiene push ni proveedor externo: el aviso es este refresco y la
   * recarga manual (decisión §38).
   */
  reload(): void {
    this.resource.reload();
  }

  /**
   * Descarta una solicitud y vuelve a leer. La lista que había era del servidor, no de una copia local:
   * tras el acto ya no es la verdad, así que se descarta en vez de parchearse a mano.
   */
  async dismiss(request: CartRequestSummary): Promise<void> {
    const eventId = this.eventId();
    if (eventId === null || this.dismissingId() !== null) {
      return;
    }

    this.dismissingId.set(request.id);
    this.failure.set(null);

    try {
      await firstValueFrom(
        this.http.delete<void>(`${this.apiBaseUrl}/events/${eventId}/cart-requests/${request.id}`),
      );

      this.resource.reload();
    } catch (error: unknown) {
      this.failure.set(dismissMessage(apiErrorCode(error)));
    } finally {
      this.dismissingId.set(null);
    }
  }
}
