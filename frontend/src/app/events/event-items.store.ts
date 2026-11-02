import { HttpClient, httpResource } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  formatPriceCents,
  type ItemList,
  type ItemSummary,
  type PublishedListing,
  type UpdatedItem,
} from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { LISTING_NOT_PUBLISHED, LISTING_PHOTO_REQUIRED, apiErrorCode } from '../session/api-error';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';

/** Mensaje de un fallo al publicar, ramificado por `code` y nunca por el mensaje del borde. */
function publishMessage(code: string | null): string {
  return code === LISTING_PHOTO_REQUIRED
    ? 'Este artículo todavía no tiene foto. Súbela para poder compartirlo.'
    : 'No se pudo publicar el artículo. Inténtalo de nuevo.';
}

/** Mensaje de un fallo al vender; vender no es publicar y el código lo dice. */
function soldMessage(code: string | null): string {
  return code === LISTING_NOT_PUBLISHED
    ? 'Publica el artículo antes de marcarlo vendido.'
    : 'No se pudo marcar como vendido. Inténtalo de nuevo.';
}

/**
 * Los artículos del evento, compartidos por las dos pestañas de la sección (`plan-ciclo-3d` §5).
 *
 * Vive en el marco del evento y no en una pestaña porque hay **dos** consumidores del mismo hecho: la
 * captura, que recarga después de publicar, y `Capturados`, que pinta la lista; y porque el contador de
 * la pestaña sale de la misma lectura. Una sola petición, una sola verdad.
 *
 * El estado publicado **no** se recuerda aquí: llega en cada artículo como `publishedSlug`, leído de
 * `app.listing`, así que recargar la página no lo pierde.
 */
@Injectable()
export class EventItemsStore {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);
  private readonly session = inject(SessionStore);

  /** El evento de esta sección: la ruta padre lo trae y las dos pestañas lo heredan. */
  readonly eventId = inject(ActivatedRoute).snapshot.paramMap.get('eventId') ?? '';

  private readonly resource = httpResource<ItemList>(
    () => `${this.apiBaseUrl}/events/${this.eventId}/items`,
  );

  readonly loading = this.resource.isLoading;
  readonly failed = computed(() => this.resource.status() === 'error');
  readonly items = computed<readonly ItemSummary[]>(() =>
    this.resource.status() === 'resolved' ? (this.resource.value()?.items ?? []) : [],
  );

  /** Contador de la pestaña: el mismo número que pinta la lista. */
  readonly count = computed(() => this.items().length);

  /** Moneda del evento, para no guardar una moneda por artículo (decisión §35). */
  readonly currency = computed(() => this.session.eventById(this.eventId)?.currency ?? 'MXN');

  /** Artículo cuya publicación está en vuelo; mientras haya uno, ningún botón se repite. */
  readonly publishingId = signal<string | null>(null);

  /** Artículo cuya venta está en vuelo; `Capturados` no repite el botón. */
  readonly sellingId = signal<string | null>(null);

  /** Último fallo de publicación, atado a su artículo para no teñir toda la lista. */
  readonly publishFailure = signal<{ readonly itemId: string; readonly message: string } | null>(
    null,
  );

  /** Último fallo de venta, atado a su artículo para no teñir toda la lista. */
  readonly sellFailure = signal<{ readonly itemId: string; readonly message: string } | null>(null);

  readonly copiedId = signal<string | null>(null);

  /** Texto del precio con la moneda del evento; nulo es «Precio a consultar». */
  priceLabel(item: ItemSummary): string {
    return formatPriceCents(item.priceCents, this.currency());
  }

  /** Una captura nueva invalida la lista: el estado anterior ya no es la verdad. */
  reload(): void {
    this.resource.reload();
  }

  /** Enlace público del artículo: el origen compilado de `shop` más su `slug`. */
  linkForSlug(slug: string): string {
    return `${this.shopBaseUrl}/${slug}`;
  }

  /**
   * Publica un artículo `en proceso`. Publicar es idempotente, así que reintentar es seguro; el
   * `slug` nuevo llega en la recarga, no en una copia local que se perdería al recargar.
   */
  /**
   * Marca la publicación como vendida (ciclo 4b, decisión §40). Es idempotente; la lista se recarga
   * porque el estado es del servidor, no de una copia local.
   */
  async sell(item: ItemSummary): Promise<void> {
    if (this.sellingId() !== null) {
      return;
    }

    this.sellingId.set(item.id);
    this.sellFailure.set(null);

    try {
      await firstValueFrom(
        this.http.post<UpdatedItem>(
          `${this.apiBaseUrl}/events/${this.eventId}/items/${item.id}/sold`,
          {},
        ),
      );

      this.reload();
    } catch (error: unknown) {
      this.sellFailure.set({ itemId: item.id, message: soldMessage(apiErrorCode(error)) });
    } finally {
      this.sellingId.set(null);
    }
  }

  async publish(item: ItemSummary): Promise<void> {
    if (this.publishingId() !== null) {
      return;
    }

    this.publishingId.set(item.id);
    this.publishFailure.set(null);
    this.copiedId.set(null);

    try {
      await firstValueFrom(
        this.http.post<PublishedListing>(
          `${this.apiBaseUrl}/events/${this.eventId}/items/${item.id}/listing`,
          {},
        ),
      );

      this.reload();
    } catch (error: unknown) {
      this.publishFailure.set({ itemId: item.id, message: publishMessage(apiErrorCode(error)) });
    } finally {
      this.publishingId.set(null);
    }
  }

  /**
   * Copia el enlace al portapapeles. Sin API de portapapeles (o con el permiso negado) la fila
   * conserva el enlace visible y seleccionable: el botón es una comodidad, no el único camino.
   */
  async copyLink(item: ItemSummary): Promise<void> {
    if (item.publishedSlug === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.linkForSlug(item.publishedSlug));
      this.copiedId.set(item.id);
    } catch {
      this.copiedId.set(null);
    }
  }
}
