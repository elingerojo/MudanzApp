import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ADMIN_EVENTS_DEFAULT_LIMIT,
  type AdminEventPage,
  type AdminEventSummary,
  type CreatedEvent,
  type CreatedInvitation,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { ADMIN_NOT_CONFIGURED, ADMIN_UNAUTHORIZED, apiErrorCode } from '../session/api-error';

/**
 * Los dos campos que la pantalla pide al crear un evento. La moneda no viaja: el esquema del borde la
 * deja en su valor por defecto y el cliente no la inventa.
 */
export interface NewEventInput {
  readonly originCity: string;
  readonly destinationCity: string;
}

/**
 * Frase de un fallo de plataforma, ramificada por `code` y nunca por el texto del borde (`stack` §9).
 * `admin_not_configured` es un hecho de la plataforma, no de la credencial: decirlo así evita que
 * alguien reescriba el token una y otra vez.
 */
function failureMessage(code: string | null): string {
  if (code === ADMIN_UNAUTHORIZED) {
    return 'La credencial no es válida.';
  }

  if (code === ADMIN_NOT_CONFIGURED) {
    return 'La plataforma no tiene ADMIN_TOKEN configurado.';
  }

  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}

/**
 * Estado de la administración de plataforma (ciclo E1, decisión §46).
 *
 * La credencial vive **solo** en esta señal: no hay `localStorage`, ni `sessionStorage`, ni una
 * plantilla que la enlace. Recargar la pestaña la pierde a propósito, y por eso la pantalla no ofrece
 * «recordarme».
 *
 * Cada petición lleva su propio `Authorization`; el interceptor de sesión deja pasar una petición que
 * ya lo trae, así que un dispositivo con sesión abierta no sustituye esta credencial por la suya.
 *
 * Las escrituras no parchean la lista: crean o emiten y vuelven a leer, porque el orden que la
 * pantalla pinta es el del borde.
 */
@Injectable({ providedIn: 'root' })
export class PlatformAdminStore {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private readonly credential = signal<string | null>(null);

  readonly signedIn = computed(() => this.credential() !== null);

  readonly events = signal<readonly AdminEventSummary[]>([]);
  readonly nextCursor = signal<string | null>(null);

  readonly loading = signal(false);

  /** Un alta o una emisión en vuelo; mientras haya una, ningún botón se repite. */
  readonly busy = signal(false);

  readonly failure = signal<string | null>(null);

  /** La credencial para el `Authorization`; un método y no una señal, para que no se pueda enlazar. */
  private authorization(): { readonly Authorization: string } {
    return { Authorization: `Bearer ${this.credential() ?? ''}` };
  }

  /**
   * Entra con la credencial escrita y lee la primera página. Si el borde la rechaza, la credencial se
   * descarta: una capacidad que no autoriza no se queda en memoria.
   */
  async signIn(token: string): Promise<boolean> {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      this.failure.set('Escribe la credencial para entrar.');
      return false;
    }

    this.credential.set(trimmed);
    this.events.set([]);
    this.nextCursor.set(null);
    this.failure.set(null);

    if (await this.load()) {
      return true;
    }

    this.credential.set(null);
    return false;
  }

  /** Cierra la credencial y la lista. No hay endpoint: la credencial solo existía aquí. */
  signOut(): void {
    this.credential.set(null);
    this.events.set([]);
    this.nextCursor.set(null);
    this.failure.set(null);
  }

  /**
   * Lee una página. Sin cursor reemplaza la lista; con cursor la extiende. Sin credencial no pide
   * nada al borde.
   */
  async load(cursor?: string): Promise<boolean> {
    if (this.credential() === null) {
      return false;
    }

    this.loading.set(true);
    this.failure.set(null);

    const query =
      cursor === undefined
        ? `?limit=${String(ADMIN_EVENTS_DEFAULT_LIMIT)}`
        : `?limit=${String(ADMIN_EVENTS_DEFAULT_LIMIT)}&cursor=${encodeURIComponent(cursor)}`;

    try {
      const page = await firstValueFrom(
        this.http.get<AdminEventPage>(`${this.apiBaseUrl}/admin/events${query}`, {
          headers: this.authorization(),
        }),
      );

      this.events.update((current) =>
        cursor === undefined ? page.events : [...current, ...page.events],
      );
      this.nextCursor.set(page.nextCursor);
      return true;
    } catch (error: unknown) {
      this.failure.set(failureMessage(apiErrorCode(error)));
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  /** Crea el evento y relee la primera página: el renglón nuevo trae fecha y administrador. */
  async createEvent(input: NewEventInput): Promise<boolean> {
    if (this.busy() || this.credential() === null) {
      return false;
    }

    this.busy.set(true);
    this.failure.set(null);

    try {
      await firstValueFrom(
        this.http.post<CreatedEvent>(`${this.apiBaseUrl}/admin/events`, input, {
          headers: this.authorization(),
        }),
      );

      this.events.set([]);
      this.nextCursor.set(null);
      return await this.load();
    } catch (error: unknown) {
      this.failure.set(failureMessage(apiErrorCode(error)));
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Emite un enlace del evento. Devuelve la emisión —con su token, que el borde enseña **una sola
   * vez**— o `null` si falló; el fallo queda en `failure`.
   */
  async issueInvitation(eventId: string): Promise<CreatedInvitation | null> {
    if (this.busy() || this.credential() === null) {
      return null;
    }

    this.busy.set(true);
    this.failure.set(null);

    try {
      return await firstValueFrom(
        this.http.post<CreatedInvitation>(
          `${this.apiBaseUrl}/admin/events/${eventId}/invitations`,
          {},
          { headers: this.authorization() },
        ),
      );
    } catch (error: unknown) {
      this.failure.set(failureMessage(apiErrorCode(error)));
      return null;
    } finally {
      this.busy.set(false);
    }
  }
}
