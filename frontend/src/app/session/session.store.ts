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
 *
 * Desde D15 el navegador también recuerda el último evento usado (`mudanzapp.event`). No sustituye a
 * la lista del borde: se valida contra ella en cada lectura de identidad.
 */
const TOKEN_STORAGE_KEY = 'mudanzapp.session';

/** El último evento usado en este navegador (corte D15). */
const EVENT_STORAGE_KEY = 'mudanzapp.event';

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
   * El último evento usado en este navegador (corte D15).
   *
   * Vive en `localStorage` para que una recarga o una visita posterior no vuelvan a preguntar por la
   * mudanza. No es un hecho del borde: en cada lectura de identidad se valida contra `events()` y un
   * identificador que la sesión ya no alcanza se ignora. Cerrar sesión no lo borra —es una
   * preferencia del navegador—, y una identidad distinta lo usa solo si lo alcanza.
   */
  private readonly rememberedEventId = signal<string | null>(null);

  /**
   * El evento que la superficie privada trata como activo (cortes D8, D2 y D15).
   *
   * `listEventsForUser` ordena por `created_at` ascendente, así que la última es la más reciente. La
   * regla de D8 —usar la más reciente— solo se conserva cuando la cuenta tiene **una** membresía:
   * con dos o más, el evento activo es el recordado en este navegador (D15) y, si no hay uno válido,
   * `null` hasta que el usuario elige en `/eventos`. Ninguna pantalla usa en silencio una membresía
   * que el usuario no eligió.
   */
  readonly activeEvent = computed<EventSummary | null>(() => {
    const events = this.events();
    const rememberedId = this.rememberedEventId();
    const remembered =
      rememberedId === null ? null : (events.find((event) => event.id === rememberedId) ?? null);
    if (remembered !== null) {
      return remembered;
    }

    return events.length === 1 ? (events[0] ?? null) : null;
  });

  readonly activeEventId = computed(() => this.activeEvent()?.id ?? null);

  /**
   * La cuenta tiene una decisión pendiente: dos o más membresías y ningún evento activo —ni siquiera
   * uno recordado que la sesión todavía alcance—. La guarda de los destinos privados la usa para
   * mandar a `/eventos` en vez de adivinar.
   */
  readonly requiresEventChoice = computed(
    () => this.events().length > 1 && this.activeEvent() === null,
  );

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

      const storedEvent = storage.getItem(EVENT_STORAGE_KEY);
      if (storedEvent !== null && storedEvent.length > 0) {
        this.rememberedEventId.set(storedEvent);
      }
    } catch {
      // Un almacenamiento ilegible degrada a «sin sesión», que tiene salida por el enlace.
    }
  }

  /**
   * Establece la sesión recién canjeada: memoria primero, disco después. El evento recordado del
   * navegador no se toca (D15): la identidad nueva lo valida y solo lo usa si lo alcanza.
   */
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

  /**
   * Cierra la sesión local. No hay endpoint: el token deja de viajar en la próxima petición. El
   * evento recordado del navegador se conserva (D15); la identidad siguiente lo valida.
   */
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

  /**
   * Fija la elección del selector (cortes D2 y D15). Solo acepta una membresía que la sesión alcance:
   * una identidad vieja o un identificador inventado no crean un evento que el borde no publicó.
   * La elección queda en memoria y, cuando el navegador lo permite, en `localStorage`.
   */
  selectEvent(eventId: string): boolean {
    if (!this.events().some((event) => event.id === eventId)) {
      return false;
    }

    this.rememberedEventId.set(eventId);
    this.writeRememberedEvent(eventId);
    return true;
  }

  /** Escribe la elección en el disco; un almacenamiento negado deja la memoria como respaldo. */
  private writeRememberedEvent(eventId: string): void {
    const storage = browserStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(EVENT_STORAGE_KEY, eventId);
    } catch {
      // La elección ya vive en memoria; el arranque no depende del disco.
    }
  }
}
