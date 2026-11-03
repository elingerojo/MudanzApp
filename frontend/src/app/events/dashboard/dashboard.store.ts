import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { EventDashboard, IdentityUser, SessionSummary } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../api-base-url.token';
import { FORBIDDEN, apiErrorCode } from '../../session/api-error';

/** Resultado de la lectura: el hecho o el código del fallo, nunca una excepción hacia el guard. */
export type DashboardLoad =
  | { readonly ok: true; readonly dashboard: EventDashboard }
  | { readonly ok: false; readonly code: string | null };

/** Mensaje de un fallo al des-invitar, ramificado por `code` y nunca por el texto del borde. */
function revokeMessage(code: string | null): string {
  return code === FORBIDDEN
    ? 'No puedes retirar el acceso de esa sesión.'
    : 'No se pudo des-invitar el dispositivo. Inténtalo de nuevo.';
}

/**
 * El panel del event-administrator (ciclo 4c-2): **una** lectura por evento (decisión §37).
 *
 * La comparten el guard y la pantalla, y por eso vive en la raíz: el guard tiene que autorizar **antes**
 * de activar la ruta y la pantalla necesita el mismo hecho para pintar. Dos peticiones de la misma
 * decisión podrían discrepar, así que se hace una y se recuerda.
 *
 * Los fallos **no** se cachean: un evento que todavía no estaba reclamado y se reclama desde la misma
 * sesión debe poder abrir el panel sin recargar el navegador.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly loaded = signal<{
    readonly eventId: string;
    readonly dashboard: EventDashboard;
  } | null>(null);

  readonly dashboard = computed<EventDashboard | null>(() => this.loaded()?.dashboard ?? null);

  readonly administrator = computed<IdentityUser | null>(
    () => this.dashboard()?.administrator ?? null,
  );

  /** Solo co-dispositivos: el borde es el único que decide qué entra en esta lista. */
  readonly devices = computed<readonly SessionSummary[]>(() => this.dashboard()?.devices ?? []);

  readonly loading = signal(false);

  /** Sesión cuyo acceso está en vuelo; mientras haya una, ningún botón se repite. */
  readonly revokingId = signal<string | null>(null);

  /** Último fallo del acto, con su frase; el acto no tiñe el resto del panel. */
  readonly accessFailure = signal<string | null>(null);

  /** El evento todavía existe para la sesión pero nadie lo reclamó todavía. */
  readonly unclaimed = computed(() => this.dashboard() !== null && this.administrator() === null);

  async load(eventId: string): Promise<DashboardLoad> {
    const cached = this.loaded();
    if (cached !== null && cached.eventId === eventId) {
      return { ok: true, dashboard: cached.dashboard };
    }

    this.loading.set(true);
    try {
      const dashboard = await firstValueFrom(
        this.http.get<EventDashboard>(`${this.apiBaseUrl}/events/${eventId}/dashboard`),
      );
      this.loaded.set({ eventId, dashboard });
      return { ok: true, dashboard };
    } catch (error: unknown) {
      // Un fallo no se cachea: el derecho puede cambiar con un reclamo, y la siguiente visita lo relee.
      return { ok: false, code: apiErrorCode(error) };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Des-invita un co-dispositivo y vuelve a leer. La lista que había era del servidor, no de una copia
   * local: tras el acto ya no es la verdad, así que se descarta en vez de parchearse a mano.
   */
  async revoke(eventId: string, device: SessionSummary): Promise<void> {
    if (this.revokingId() !== null) {
      return;
    }

    this.revokingId.set(device.id);
    this.accessFailure.set(null);

    try {
      await firstValueFrom(
        this.http.delete<void>(`${this.apiBaseUrl}/events/${eventId}/sessions/${device.id}`),
      );

      this.loaded.set(null);
      await this.load(eventId);
    } catch (error: unknown) {
      this.accessFailure.set(revokeMessage(apiErrorCode(error)));
    } finally {
      this.revokingId.set(null);
    }
  }
}
