import { IMAGE_LOADER, NgOptimizedImage, type ImageLoaderConfig } from '@angular/common';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { cardModel, type EventCardModel, type PublicEventIndex } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';

/**
 * Loader de identidad de la miniatura. No hay CDN que transforme: la URL que emite el backend es la
 * que se descarga del almacén, y el descriptor (`srcset`, `sizes`, dimensiones) ya viene resuelto por
 * `cardModel`.
 */
function identityLoader(config: ImageLoaderConfig): string {
  return config.src;
}

/** El contenedor del snapshot y el `<meta>` con la clave de versión que sirve el Worker. */
const SNAPSHOT_ID = 'evento-snapshot';
const VERSION_META = 'meta[name="event-version"]';

/**
 * Índice público del evento (ciclo 4a, `event-index`).
 *
 * La página llega ya renderizada por el backend dentro de la shell, así que el visitante lee y toca
 * las tarjetas antes de que arranque el JavaScript. Cuando Angular arranca, `bootstrapApplication`
 * ya reemplazó el contenido de `<app-root>`, pero el snapshot vive en un hermano
 * (`#evento-snapshot`) y este componente lo retira en cuanto su propia lista está en el DOM.
 *
 * La versión incrustada decide el camino observable (§4):
 * - coincide → `retired`: el caso normal no tocó el DOM más allá de retirar el snapshot;
 * - difiere → `replaced`: la lista del componente reemplaza a la vieja en la misma celda.
 *
 * Nada personal entra aquí: se lee sin sesión y la grilla se compone desde el mismo `cardModel` que
 * usa el servidor, que es lo que sostiene la paridad de las dos renderizaciones.
 */
@Component({
  selector: 'app-event-index',
  imports: [NgOptimizedImage, RouterLink],
  templateUrl: './event-index.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: IMAGE_LOADER, useValue: identityLoader }],
})
export class EventIndexComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly document = inject(DOCUMENT);

  protected readonly publicSlug = this.route.snapshot.paramMap.get('publicSlug') ?? '';

  private readonly index = httpResource<PublicEventIndex>(() => {
    const slug = this.publicSlug;
    return slug.length === 0
      ? undefined
      : `${this.apiBaseUrl}/public/events/${encodeURIComponent(slug)}`;
  });

  protected readonly loading = this.index.isLoading;

  protected readonly value = computed<PublicEventIndex | null>(() =>
    this.index.status() === 'resolved' ? (this.index.value() ?? null) : null,
  );

  /** Las tarjetas ya resueltas por el modelo compartido: el template no compone ningún texto. */
  protected readonly cards = computed<readonly EventCardModel[]>(() =>
    (this.value()?.listings ?? []).map(cardModel),
  );

  /** Un `publicSlug` inexistente y uno mal formado responden lo mismo: `not_found` (§24). */
  protected readonly notFound = computed(() => {
    const error = this.index.error();
    return error instanceof HttpErrorResponse && error.status === 404;
  });

  protected readonly failed = computed(() => this.index.status() === 'error' && !this.notFound());

  /** Qué hizo el componente con el snapshot. Es estado de la visita, no del contrato. */
  protected readonly snapshot = signal<'absent' | 'retired' | 'replaced'>('absent');

  constructor() {
    // Se ejecuta después de que Angular pintó la lista: retirar antes dejaría un hueco visible.
    afterRenderEffect(() => {
      const payload = this.value();
      if (payload === null) {
        return;
      }

      const container = this.document.getElementById(SNAPSHOT_ID);
      if (container === null) {
        return;
      }

      const embedded = this.document.querySelector(VERSION_META)?.getAttribute('content') ?? null;
      container.remove();
      this.snapshot.set(embedded === payload.version ? 'retired' : 'replaced');
    });
  }
}
