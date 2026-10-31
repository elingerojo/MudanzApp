import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ItemList, ItemSummary, PublishedListing } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { ItemFormComponent } from '../items/item-form.component';
import { ItemPhotoComponent } from '../items/item-photo.component';
import { LISTING_PHOTO_REQUIRED, apiErrorCode } from '../session/api-error';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { uiButtonClasses } from '../ui/ui-button/ui-button';

/** Mensaje de un fallo al publicar, ramificado por `code` y nunca por el mensaje del borde. */
function publishMessage(code: string | null): string {
  return code === LISTING_PHOTO_REQUIRED
    ? 'Este artículo todavía no tiene foto. Súbela para poder compartirlo.'
    : 'No se pudo publicar el artículo. Inténtalo de nuevo.';
}

/**
 * Sección del evento (`/eventos/:eventId`), con guard.
 *
 * Es la pantalla operativa del ciclo 3a y, desde el ciclo 3c, la superficie desde la que se **publica**
 * un artículo (`resumen-funcional` §3 y §4). La lista es un `httpResource`, así que crear un artículo
 * solo exige recargarla; la foto se pide aparte, con la sesión del dispositivo, porque la lectura
 * pública de la imagen vive en la ficha de `shop` y no aquí.
 *
 * Publicar devuelve el `slug` y la fila muestra el enlace que se copia: `shopBaseUrl + '/' + slug`.
 * El estado de publicación es de esta visita —publicar es idempotente y republicar devuelve la misma
 * URL—, así que recargar la pantalla vuelve a ofrecer el botón y nunca inventa un enlace nuevo.
 */
@Component({
  selector: 'app-event',
  imports: [RouterLink, ItemFormComponent, ItemPhotoComponent, UiCardComponent],
  templateUrl: './event.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);

  protected readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';

  /** Ciudades del evento, cuando la identidad de la sesión ya las conoce. */
  protected readonly event = computed(() => this.session.eventById(this.eventId));

  protected readonly sessionInvalid = this.session.identityFailed;

  private readonly itemsResource = httpResource<ItemList>(
    () => `${this.apiBaseUrl}/events/${this.eventId}/items`,
  );

  protected readonly loading = this.itemsResource.isLoading;
  protected readonly failed = computed(() => this.itemsResource.status() === 'error');
  protected readonly items = computed<readonly ItemSummary[]>(() =>
    this.itemsResource.status() === 'resolved' ? (this.itemsResource.value()?.items ?? []) : [],
  );

  /** `slug` publicado por artículo, en memoria: es lo que la fila usa para pintar el enlace. */
  private readonly publishedSlugs = signal<ReadonlyMap<string, string>>(new Map());

  /** Artículo cuya publicación está en vuelo; mientras haya uno, el botón no se repite. */
  protected readonly publishingId = signal<string | null>(null);

  /** Último fallo de publicación, atado a su artículo para no teñir toda la lista. */
  protected readonly publishFailure = signal<{
    readonly itemId: string;
    readonly message: string;
  } | null>(null);

  protected readonly copiedId = signal<string | null>(null);

  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /** Enlace público del artículo, o `null` mientras no se haya publicado en esta visita. */
  protected linkFor(itemId: string): string | null {
    const slug = this.publishedSlugs().get(itemId);
    return slug === undefined ? null : `${this.shopBaseUrl}/${slug}`;
  }

  /** Una captura nueva invalida la lista: el estado anterior ya no es la verdad. */
  protected reload(): void {
    this.itemsResource.reload();
  }

  protected async publish(item: ItemSummary): Promise<void> {
    if (this.publishingId() !== null) {
      return;
    }

    this.publishingId.set(item.id);
    this.publishFailure.set(null);
    this.copiedId.set(null);

    try {
      const listing = await firstValueFrom(
        this.http.post<PublishedListing>(
          `${this.apiBaseUrl}/events/${this.eventId}/items/${item.id}/listing`,
          {},
        ),
      );

      this.publishedSlugs.update((current) => new Map(current).set(item.id, listing.slug));
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
  protected async copyLink(itemId: string): Promise<void> {
    const link = this.linkFor(itemId);
    if (link === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      this.copiedId.set(itemId);
    } catch {
      this.copiedId.set(null);
    }
  }
}
