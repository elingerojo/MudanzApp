import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { CartItem, IssuedCartRequest, PublicCart } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import {
  CART_EMPTY,
  LISTING_SOLD,
  PRICE_MISSING,
  SESSION_REVOKED,
  UNAUTHORIZED,
  WHATSAPP_NOT_CONFIGURED,
  shopApiErrorCode,
} from '../session/shop-api-error';
import { ShopSessionStore } from '../session/shop-session.store';

/** La lista local de un evento: se pinta sin esperar y sobrevive al navegador (decisión §39). */
const STORAGE_PREFIX = 'mudanzapp.shop.selected.';

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Un navegador que niega el almacenamiento no debe romper la tienda.
    return null;
  }
}

/** Frase de un fallo del carrito, ramificada por el código estable del borde. */
function failureMessage(code: string | null): string {
  if (code === UNAUTHORIZED || code === SESSION_REVOKED) {
    return 'Tu sesión ya no sirve: entra otra vez para pedir.';
  }

  if (code === WHATSAPP_NOT_CONFIGURED) {
    return 'El vendedor todavía no configuró su WhatsApp.';
  }

  if (code === PRICE_MISSING) {
    return 'Alguno de los artículos ya no tiene precio: quítalo para poder pedir.';
  }

  if (code === LISTING_SOLD) {
    return 'Alguno de los artículos ya se vendió: quítalo para poder pedir.';
  }

  if (code === CART_EMPTY) {
    return 'Tu selección está vacía.';
  }

  return 'No se pudo completar la acción. Inténtalo de nuevo.';
}

/**
 * El carrito de seleccionados del comprador (ciclo 4e, `cart-request`).
 *
 * Dos hechos, una sola verdad: el carrito es del **servidor** y `localStorage` es su espejo (decisión
 * §39). La lista local pinta de inmediato y guarda lo que el visitante anónimo marcó; al entrar con la
 * cuenta de tienda, las dos listas se **unen** y se escriben con un `PUT` que reemplaza entero, así que
 * reintentar no duplica nada.
 *
 * El carrito es por **evento**: la clave local y la URL llevan el `publicSlug`. No hay carrito entre
 * eventos ni inicio de sesión único con la aplicación privada.
 */
@Injectable({ providedIn: 'root' })
export class ShopCartStore {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly session = inject(ShopSessionStore);

  /** El evento de la página actual; sin él no hay lista ni carrito. */
  private readonly publicSlug = signal<string | null>(null);

  /** La lista local, espejo de lo guardado y fuente de «¿está en la selección?». */
  private readonly local = signal<readonly string[]>([]);

  /** Lo que un acto acaba de escribir. Manda sobre la lectura hasta que se vuelva a leer. */
  private readonly written = signal<PublicCart | null>(null);

  /** Lo que el borde no pudo guardar en el último `PUT` (vendido, sin precio o fuera del evento). */
  private readonly droppedSlugs = signal<readonly string[]>([]);

  private readonly requesting = signal(false);
  private readonly failures = signal<string | null>(null);

  /**
   * La lectura del carrito. Solo existe con sesión de tienda: un visitante anónimo tiene su lista
   * local y nada más, y el borde no le debe una lectura que no puede autorizar.
   */
  private readonly resource = httpResource<{ readonly cart: PublicCart } | null>(
    () => {
      const slug = this.publicSlug();
      return slug === null || !this.session.hasSession()
        ? undefined
        : `${this.apiBaseUrl}/public/events/${slug}/cart`;
    },
    { defaultValue: null },
  );

  /**
   * El carrito que la pantalla pinta: la última escritura si hubo una, y si no la lectura del borde.
   * Es una sola verdad a la vista, sin dos copias que puedan discrepar.
   */
  readonly cart = computed<PublicCart | null>(
    () => this.written() ?? this.resource.value()?.cart ?? null,
  );

  readonly items = computed<readonly CartItem[]>(() => this.cart()?.items ?? []);
  readonly currency = computed(() => this.cart()?.event.currency ?? 'MXN');

  /** Es lo que habilita `Pídelos por WhatsApp`: el número del vendedor existe. */
  readonly whatsappAvailable = computed(() => this.cart()?.whatsappAvailable ?? false);
  readonly openRequest = computed(() => this.cart()?.request ?? null);

  readonly dropped = computed<readonly string[]>(() => this.droppedSlugs());
  readonly failure = computed<string | null>(() => this.failures());
  readonly busy = computed(() => this.requesting());
  readonly loading = this.resource.isLoading;

  constructor() {
    // La lectura alimenta la copia que pinta la pantalla. Es un efecto y no un `set` en cada llamada
    // porque el recurso puede resolverse por una recarga externa (por ejemplo, al volver al foco).
    //
    // La unión va en `untracked`: sin eso, `merge` leería la lista local dentro del efecto y escribir
    // en ella volvería a dispararlo, en un ciclo que no termina nunca.
    effect(() => {
      const resolved = this.resource.value();
      if (resolved === null) {
        return;
      }

      void untracked(() => this.merge(resolved.cart));
    });
  }

  /** Cuántos artículos hay guardados en total, con sesión o sin ella. */
  count(): number {
    return this.local().length;
  }

  /** ¿Este artículo está en la selección? Es la pregunta que hace el botón de la ficha. */
  has(slug: string): boolean {
    return this.local().includes(slug);
  }

  /**
   * Abre el carrito del evento de la página. Cambiar de evento cambia de lista: la clave local y el
   * recurso llevan el `publicSlug`.
   */
  open(publicSlug: string): void {
    if (this.publicSlug() === publicSlug) {
      return;
    }

    this.publicSlug.set(publicSlug);
    this.written.set(null);
    this.droppedSlugs.set([]);
    this.failures.set(null);
    this.local.set(this.readStored(publicSlug));
  }

  /**
   * Guarda o quita un artículo. Sin sesión solo toca la lista local; con sesión, además escribe el
   * carrito entero, porque el servidor es la verdad.
   */
  async toggle(slug: string): Promise<void> {
    const current = this.local();
    const next = current.includes(slug)
      ? current.filter((entry) => entry !== slug)
      : [...current, slug];

    this.persist(next);
    await this.write(next);
  }

  /** Pide el carrito por WhatsApp y devuelve el enlace, o `null` si el borde lo rechazó. */
  async request(): Promise<string | null> {
    const slug = this.publicSlug();
    if (slug === null || !this.session.hasSession() || this.requesting()) {
      return null;
    }

    this.requesting.set(true);
    this.failures.set(null);

    try {
      const issued = await firstValueFrom(
        this.http.post<IssuedCartRequest>(
          `${this.apiBaseUrl}/public/events/${slug}/cart/request`,
          {},
        ),
      );

      // La respuesta es el hecho nuevo: se publica sin esperar otra lectura, y la próxima visita a la
      // página vuelve a leer el carrito con la solicitud ya abierta.
      const current = this.cart();
      if (current !== null) {
        this.written.set({ ...current, request: issued.request });
      }

      return issued.request.whatsappUrl;
    } catch (error: unknown) {
      this.failures.set(failureMessage(shopApiErrorCode(error)));
      return null;
    } finally {
      this.requesting.set(false);
    }
  }

  /** Cancela la solicitud abierta. La fila no se borra: se escribe su cancelación. */
  async cancelRequest(): Promise<void> {
    const slug = this.publicSlug();
    if (slug === null || !this.session.hasSession()) {
      return;
    }

    this.failures.set(null);

    try {
      await firstValueFrom(
        this.http.delete<void>(`${this.apiBaseUrl}/public/events/${slug}/cart/request`),
      );

      const current = this.cart();
      if (current !== null) {
        this.written.set({ ...current, request: null });
      }
    } catch (error: unknown) {
      this.failures.set(failureMessage(shopApiErrorCode(error)));
    }
  }

  /**
   * Relee el carrito del servidor y descarta la copia de un acto anterior: la lectura es la verdad
   * cuando se pide de nuevo, no lo que la pantalla recordaba.
   */
  reload(): void {
    this.written.set(null);
    this.resource.reload();
  }

  /**
   * Une la lista local con la del servidor al entrar: lo que el visitante marcó antes de tener cuenta
   * no se pierde y lo que ya estaba en el servidor permanece. Si no hay nada que unir, adopta el
   * orden del servidor sin escribir.
   */
  private async merge(server: PublicCart): Promise<void> {
    const serverSlugs = server.items.map((item) => item.slug);
    const local = this.local();

    if (local.length === 0) {
      this.local.set(serverSlugs);
      return;
    }

    const union = [...new Set([...serverSlugs, ...local])];
    if (union.length === serverSlugs.length) {
      this.local.set(serverSlugs);
      return;
    }

    await this.write(union);
  }

  /**
   * Escribe el carrito entero. Sin sesión solo persiste la lista local; con sesión, el borde decide y
   * devuelve el carrito resultante con lo que no pudo guardar.
   */
  private async write(slugs: readonly string[]): Promise<void> {
    const slug = this.publicSlug();
    if (slug === null || !this.session.hasSession()) {
      this.persist(slugs);
      return;
    }

    try {
      const result = await firstValueFrom(
        this.http.put<{ readonly cart: PublicCart; readonly dropped: readonly string[] }>(
          `${this.apiBaseUrl}/public/events/${slug}/cart`,
          { slugs },
        ),
      );

      this.written.set(result.cart);
      this.droppedSlugs.set(result.dropped);
      this.persist(result.cart.items.map((item) => item.slug));
      this.failures.set(null);
    } catch (error: unknown) {
      this.failures.set(failureMessage(shopApiErrorCode(error)));
      this.persist(slugs);
    }
  }

  private readStored(publicSlug: string): readonly string[] {
    const storage = browserStorage();
    if (storage === null) {
      return [];
    }

    try {
      const raw = storage.getItem(`${STORAGE_PREFIX}${publicSlug}`);
      if (raw === null) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
    } catch {
      // Un almacenamiento ilegible degrada a una selección vacía, que tiene salida por la ficha.
      return [];
    }
  }

  private persist(slugs: readonly string[]): void {
    this.local.set(slugs);

    const publicSlug = this.publicSlug();
    const storage = browserStorage();
    if (publicSlug === null || storage === null) {
      return;
    }

    try {
      storage.setItem(`${STORAGE_PREFIX}${publicSlug}`, JSON.stringify(slugs));
    } catch {
      // Sin cuota, la selección vive lo que viva la pestaña.
    }
  }
}
