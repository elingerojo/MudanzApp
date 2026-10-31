import { IMAGE_LOADER, NgOptimizedImage, type ImageLoaderConfig } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import type { PublicListing } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';

/**
 * Loader de identidad de la foto pública.
 *
 * La directiva aporta dimensiones, `priority` y `loading`, y no hay CDN que transforme: la URL que
 * emite el backend es la que se descarga del almacén. El loader devuelve esa URL tal cual.
 */
function identityLoader(config: ImageLoaderConfig): string {
  return config.src;
}

/**
 * Primera página pública de producto (`publish`, ciclo 3c).
 *
 * Es el destino del enlace que se comparte por WhatsApp: se abre **sin sesión** y pinta la ficha que
 * devuelve `GET /public/listings/:slug`. No emite metadatos por ruta —WhatsApp no ejecuta la SPA y la
 * tarjeta de vista previa sigue siendo la del sitio (decisión §28)— y solo fija el título del
 * documento con el del artículo.
 *
 * La foto llega como URL absoluta y se descarga del almacén público, no del backend (decisión §26).
 * El contrato no trae precio ni moneda: la venta se cierra fuera de la aplicación.
 *
 * `priority` en la foto deja una advertencia de desarrollo (`NG02956`) pidiendo un `preconnect` al
 * origen de la imagen. Ese origen es la base pública del almacén, que decide el backend en runtime y
 * no puede estar en el `<head>` construido: la advertencia se acepta en dev, no falla la corrida y no
 * viaja al artefacto de producción.
 */
@Component({
  selector: 'app-listing',
  imports: [NgOptimizedImage],
  templateUrl: './listing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: IMAGE_LOADER, useValue: identityLoader }],
})
export class ListingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly title = inject(Title);

  protected readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';

  private readonly listing = httpResource<PublicListing>(() => {
    const slug = this.slug;
    return slug.length === 0
      ? undefined
      : `${this.apiBaseUrl}/public/listings/${encodeURIComponent(slug)}`;
  });

  protected readonly loading = this.listing.isLoading;

  protected readonly value = computed<PublicListing | null>(() =>
    this.listing.status() === 'resolved' ? (this.listing.value() ?? null) : null,
  );

  /** Un `slug` inexistente y uno mal formado responden lo mismo: `not_found` (decisión §24). */
  protected readonly notFound = computed(() => {
    const error = this.listing.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  protected readonly failed = computed(() => this.listing.status() === 'error' && !this.notFound());

  constructor() {
    // El título del documento es del artículo; el de la marca sigue mandando en el resto de rutas.
    effect(() => {
      const listing = this.value();
      if (listing !== null) {
        this.title.setTitle(listing.title);
      }
    });
  }
}
