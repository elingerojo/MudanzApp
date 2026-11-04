import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { IdentityUser, IssuedSession, ShopIdentity } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';

/**
 * Fuente única de la sesión de la tienda (ciclo 4d, `shop-account`).
 *
 * Un solo dato manda: la credencial. `hasSession` se deriva de ella y nunca se guarda por separado. La
 * identidad (`/auth/shop/session`) es un `httpResource` que se recalcula cuando la credencial cambia,
 * así que entrar, guardar el nombre o cerrar sesión no exige recargar la página.
 *
 * La credencial vive en `localStorage` bajo su propia clave, no la de `frontend`: son orígenes y
 * alcances distintos. Nunca se expone como señal pública; el único que la lee es el interceptor.
 */
const TOKEN_STORAGE_KEY = 'mudanzapp.shop.session';

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Un navegador que niega el almacenamiento no debe romper el arranque.
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class ShopSessionStore {
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);

  /** La credencial, en memoria. Nunca se renderiza ni se registra. */
  private readonly credential = signal<string | null>(null);

  private readonly session = httpResource<ShopIdentity | null>(
    () => (this.credential() === null ? undefined : `${this.apiBaseUrl}/auth/shop/session`),
    { defaultValue: null },
  );

  readonly hasSession = computed(() => this.credential() !== null);

  /** Identidad resuelta, o `null` mientras carga, falla o no hay sesión. */
  readonly identity = computed<ShopIdentity | null>(() =>
    this.session.status() === 'resolved' ? this.session.value() : null,
  );

  readonly user = computed<IdentityUser | null>(() => this.identity()?.user ?? null);
  readonly identityFailed = computed(() => this.session.status() === 'error');
  readonly identityLoading = computed(() => this.session.isLoading());

  /** La credencial para el interceptor. Un método, no una señal: no se puede enlazar. */
  token(): string | null {
    return this.credential();
  }

  /** Reconstruye la sesión desde el disco antes de que el router active una ruta. */
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
      // Un almacenamiento ilegible degrada a «sin sesión», que tiene salida por el acceso.
    }
  }

  /** Establece la sesión recién emitida: memoria primero, disco después. */
  establish(session: IssuedSession): void {
    this.credential.set(session.sessionToken);

    const storage = browserStorage();
    if (storage === null) {
      return;
    }

    try {
      storage.setItem(TOKEN_STORAGE_KEY, session.sessionToken);
    } catch {
      // Con el almacenamiento negado la sesión vive lo que viva la pestaña.
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

  /** Nombre visible opcional: escribe la fila del sujeto y vuelve a leer la identidad. */
  async updateDisplayName(displayName: string): Promise<IdentityUser> {
    const { user } = await firstValueFrom(
      this.http.patch<{ readonly user: IdentityUser }>(`${this.apiBaseUrl}/auth/shop/profile`, {
        displayName,
      }),
    );

    this.session.reload();
    return user;
  }
}
