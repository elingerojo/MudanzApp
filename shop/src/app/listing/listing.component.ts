import { IMAGE_LOADER, NgOptimizedImage, type ImageLoaderConfig } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import type { PublicListing, PublicPhotoSize } from '@mudanzapp/shared';

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

/** Los tres tamaños de la galería, ya resueltos con la caída heredada. */
interface Gallery {
  readonly thumb: PublicPhotoSize | null;
  readonly medium: PublicPhotoSize | null;
  readonly large: PublicPhotoSize | null;
}

/**
 * Primera página pública de producto (`publish`, ciclo 3c; tres tamaños desde 3c-optimizar).
 *
 * Es el destino del enlace que se comparte por WhatsApp: se abre **sin sesión** y pinta la ficha que
 * devuelve `GET /public/listings/:slug`. No emite metadatos por ruta —WhatsApp no ejecuta la SPA y la
 * tarjeta de vista previa sigue siendo la del sitio (decisión §28)— y solo fija el título del
 * documento con el del artículo.
 *
 * La foto llega con tres tamaños y sus dimensiones **reales**, así que la ficha reserva la caja del
 * tamaño mediano en vez de inventarla. Tocar la mediana abre la grande en un overlay: es el zoom del
 * ciclo, sin dependencia nueva y sin `srcset` responsivo (eso es de 3e). El contrato no trae precio
 * ni moneda: la venta se cierra fuera de la aplicación.
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
  host: { '(document:keydown.escape)': 'closeZoom()' },
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

  /**
   * Galería con la caída heredada: un tamaño ausente usa el grande, que es el que siempre existe en
   * una foto publicada. Una ficha sin ningún tamaño no pinta galería.
   */
  protected readonly gallery = computed<Gallery | null>(() => {
    const photo = this.value()?.photo ?? null;
    if (photo === null) {
      return null;
    }

    const large = photo.sizes.large;
    const thumb = photo.sizes.thumb ?? large;
    const medium = photo.sizes.medium ?? large;

    if (thumb === null && medium === null && large === null) {
      return null;
    }

    return { thumb, medium, large };
  });

  /** Vista ampliada: la grande sobre el contenido. Es estado de la visita, no del contrato. */
  protected readonly zoomed = signal(false);

  /** Un `slug` inexistente y uno mal formado responden lo mismo: `not_found` (decisión §24). */
  protected readonly notFound = computed(() => {
    const error = this.listing.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  protected readonly failed = computed(() => this.listing.status() === 'error' && !this.notFound());

  /** El control que abrió la vista ampliada: el foco vuelve ahí al cerrar. */
  private zoomOrigin: HTMLElement | null = null;

  constructor() {
    // El título del documento es del artículo; el de la marca sigue mandando en el resto de rutas.
    effect(() => {
      const listing = this.value();
      if (listing !== null) {
        this.title.setTitle(listing.title);
      }
    });
  }

  protected openZoom(origin: HTMLElement): void {
    this.zoomOrigin = origin;
    this.zoomed.set(true);
  }

  protected closeZoom(): void {
    if (!this.zoomed()) {
      return;
    }

    this.zoomed.set(false);
    this.zoomOrigin?.focus();
    this.zoomOrigin = null;
  }
}
