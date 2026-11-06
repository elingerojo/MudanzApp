import { httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  CurrentIdentity,
  EventSummary,
  IdentityUser,
  IssuedSession,
  SessionScope,
} from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';

/**
 * Fuente única de la sesión del dispositivo.
 *
 * Un solo dato manda: la credencial. `hasSession` se deriva de ella y nunca se guarda por separado.
 * La identidad (`/auth/session`) es un `httpResource` que se recalcula cuando la credencial cambia,
 * así que canjear un enlace o cerrar sesión no exige recargar la página.
 *
 * La credencial vive en `localStorage` (decisión §27) y **nunca** se expone como señal pública: el
 * único que la lee es el interceptor, por `token()`, para que ninguna plantilla pueda enlazarla.
 */
const TOKEN_STORAGE_KEY = 'mudanzapp.session';

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Un navegador que niega el almacenamiento no debe romper el arranque.
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly apiBaseUrl = inject(API_BASE_URL);

  /** La credencial, en memoria. Nunca se renderiza ni se registra. */
  private readonly credential = signal<string | null>(null);

  private readonly session = httpResource<CurrentIdentity | null>(
    () => (this.credential() === null ? undefined : `${this.apiBaseUrl}/auth/session`),
    { defaultValue: null },
  );

  readonly hasSession = computed(() => this.credential() !== null);

  /** Identidad resuelta, o `null` mientras carga, falla o no hay sesión. */
  readonly identity = computed<CurrentIdentity | null>(() =>
    this.session.status() === 'resolved' ? this.session.value() : null,
  );

  readonly user = computed<IdentityUser | null>(() => this.identity()?.user ?? null);
  readonly events = computed<readonly EventSummary[]>(() => this.identity()?.events ?? []);

  /**
   * El evento que la superficie privada trata como activo (corte D8).
   *
   * `listEventsForUser` ordena por `created_at` ascendente, así que el primero es el más antiguo. La
   * superficie usa la **membresía más reciente**, que es la mudanza en curso; el selector explícito
   * de una cuenta con varias membresías es D2 y reemplazará esta regla sin cambiar las rutas.
   */
  readonly activeEvent = computed<EventSummary | null>(() => this.events().at(-1) ?? null);
  readonly activeEventId = computed(() => this.activeEvent()?.id ?? null);

  /**
   * Estado de la lectura de identidad. La credencial se restaura de forma síncrona, pero el evento
   * activo llega de una lectura de red: la guarda del dashboard espera a que esta señal deje de
   * cargar antes de decidir.
   */
  readonly identityStatus = this.session.status;

  /** La sesión existe pero el backend no la reconoce: el enlace es el camino de vuelta. */
  readonly identityFailed = computed(() => this.session.status() === 'error');
  readonly identityLoading = computed(() => this.session.isLoading());

  /** La credencial para el interceptor. Un método, no una señal: no se puede enlazar. */
  token(): string | null {
    return this.credential();
  }

  scope(): SessionScope | null {
    return this.identity()?.session.scope ?? null;
  }

  /**
   * Reconstruye la sesión desde el disco. Se ejecuta en el inicializador de la app, antes de que el
   * router active una ruta con guard: sin esto, una recarga con credencial se leería como «sin
   * sesión».
   */
  restore(): void {
    const storage = browserStorage();
    if (storage === null) {
      return;
    }

    try {
      const stored = storage.getItem(TOKEN_STORAGE_KEY);
      if (stored !== null && stored.length > 0) {
        this.credential.set(stored);
      }
    } catch {
      // Un almacenamiento ilegible degrada a «sin sesión», que tiene salida por el enlace.
    }
  }

  /** Establece la sesión recién canjeada: memoria primero, disco después. */
  establish(session: IssuedSession): void {
    this.credential.set(session.sessionToken);

    const storage = browserStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(TOKEN_STORAGE_KEY, session.sessionToken);
    } catch {
      // Con el almacenamiento negado la sesión vive lo que viva la pestaña; el enlace sigue ahí.
    }
  }

  /** Cierra la sesión local. No hay endpoint: el token deja de viajar en la próxima petición. */
  clear(): void {
    this.credential.set(null);

    const storage = browserStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      // Nada que hacer: la credencial ya está fuera de memoria.
    }
  }

  /** El evento visible con ese identificador, si la sesión lo alcanza. */
  eventById(eventId: string): EventSummary | null {
    return this.events().find((event) => event.id === eventId) ?? null;
  }
}
