import { IMAGE_LOADER, NgOptimizedImage, type ImageLoaderConfig } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { listingPageModel, type ListingPageModel, type PublicListing } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ShopCartStore } from '../cart/shop-cart.store';

/**
 * Loader de identidad de la foto pública.
 *
 * La directiva aporta dimensiones, `priority` y `loading`, y no hay CDN que transforme: la URL que
 * emite el backend es la que se descarga del almacén. El loader devuelve esa URL tal cual.
 */
function identityLoader(config: ImageLoaderConfig): string {
  return config.src;
}

/** El contenedor del snapshot y el `<meta>` con la clave de versión que sirve el Worker. */
const SNAPSHOT_ID = 'ficha-snapshot';
const VERSION_META = 'meta[name="listing-version"]';

/**
 * Ficha pública de un artículo publicado (`publish`, ciclo 3c; precio y venta desde 4b).
 *
 * Es el destino del enlace que se comparte por WhatsApp: se abre **sin sesión**. Desde el ciclo 4b
 * la página llega ya renderizada por el backend dentro de la shell y este componente retira el
 * snapshot cuando su propio modelo está en el DOM; el modelo compartido `listingPageModel` compone
 * todos los textos y descriptores, así que las dos renderizaciones no pueden separarse.
 *
 * Una ficha vendida conserva su página durante la cortesía y muestra `Vendido`; el `noindex` y el
 * `410` son cabeceras del Worker, no una `<meta>` que el crawler no leería. Tocar la mediana abre la
 * grande en un overlay: es el zoom del ciclo, sin dependencia nueva.
 */
@Component({
  selector: 'app-listing',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './listing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: IMAGE_LOADER, useValue: identityLoader }],
  host: { '(document:keydown.escape)': 'closeZoom()' },
})
export class ListingComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly title = inject(Title);
  private readonly document = inject(DOCUMENT);
  private readonly cart = inject(ShopCartStore);

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

  /** La ficha resuelta por el modelo compartido: el template no compone ningún texto. */
  protected readonly model = computed<ListingPageModel | null>(() => {
    const listing = this.value();
    return listing === null ? null : listingPageModel(listing);
  });

  /** Un `slug` inexistente y uno mal formado responden lo mismo: `not_found` (decisión §24). */
  protected readonly notFound = computed(() => {
    const error = this.listing.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  /** La cortesía de una ficha vendida venció: el backend responde `410 listing_gone`. */
  protected readonly gone = computed(() => {
    const error = this.listing.error();
    return error instanceof HttpErrorResponse && error.status === 410;
  });

  protected readonly failed = computed(
    () => this.listing.status() === 'error' && !this.notFound() && !this.gone(),
  );

  /** ¿Ya está en la selección de su evento? Es estado del comprador, no del contrato. */
  protected readonly inCart = computed(() => this.cart.has(this.slug));

  /** La ruta del carrito de este evento; `null` mientras la ficha no resolvió. */
  protected readonly cartHref = computed<readonly string[] | null>(() => {
    const publicSlug = this.value()?.event.publicSlug;
    return publicSlug === undefined ? null : ['/carrito', publicSlug];
  });

  /**
   * Por qué el artículo no se puede guardar: vendido o sin precio (decisiones §35 y §40).
   *
   * El borde lo rechaza igual —`listing_sold` y `price_missing`—, pero la ficha lo dice **antes** en
   * vez de ofrecer un botón cuyo `PUT` descartaría el artículo en silencio. Es la corrección de la
   * revisión `live` del 2026-11-05: guardar un artículo sin precio se leía como «ya no disponible».
   */
  protected readonly cartBlocked = computed<'sold' | 'price' | null>(() => {
    const listing = this.value();
    if (listing === null) {
      return null;
    }

    if (listing.soldAt !== null) {
      return 'sold';
    }

    return listing.priceCents === null ? 'price' : null;
  });

  /** El guardado está en vuelo: el botón no se repite. */
  protected readonly savingCart = signal(false);

  /** Qué hizo el componente con el snapshot. Es estado de la visita, no del contrato. */
  protected readonly snapshot = signal<'absent' | 'retired' | 'replaced'>('absent');

  /** Vista ampliada: la grande sobre el contenido. Es estado de la visita, no del contrato. */
  protected readonly zoomed = signal(false);

  /** El control que abrió la vista ampliada: el foco vuelve ahí al cerrar. */
  private zoomOrigin: HTMLElement | null = null;

  constructor() {
    // El título del documento es del artículo; el de la marca sigue mandando en el resto de rutas.
    effect(() => {
      const model = this.model();
      if (model !== null) {
        this.title.setTitle(model.title);
      }
    });

    // La selección es por evento: al resolver la ficha se abre el carrito de **su** evento.
    effect(() => {
      const publicSlug = this.value()?.event.publicSlug;
      if (publicSlug !== undefined) {
        this.cart.open(publicSlug);
      }
    });

    // Se ejecuta después de que Angular pintó la ficha: retirar antes dejaría un hueco visible.
    afterRenderEffect(() => {
      const model = this.model();
      if (model === null) {
        return;
      }

      const container = this.document.getElementById(SNAPSHOT_ID);
      if (container === null) {
        return;
      }

      const embedded = this.document.querySelector(VERSION_META)?.getAttribute('content') ?? null;
      container.remove();
      this.snapshot.set(embedded === this.value()?.version ? 'retired' : 'replaced');
    });
  }

  /**
   * Guarda o quita el artículo de la selección (ciclo 4e).
   *
   * Sin sesión solo toca la lista local del navegador: el carrito completo, el precio y la solicitud
   * viven en `/carrito/:publicSlug`, que es donde se entra con la cuenta de tienda. Guardar no exige
   * cuenta; pedir, sí.
   */
  protected async toggleCart(): Promise<void> {
    const publicSlug = this.value()?.event.publicSlug;
    if (publicSlug === undefined || this.savingCart() || this.cartBlocked() !== null) {
      return;
    }

    this.cart.open(publicSlug);
    this.savingCart.set(true);

    try {
      await this.cart.toggle(this.slug);
    } finally {
      this.savingCart.set(false);
    }
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
