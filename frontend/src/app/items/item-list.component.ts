import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ItemSummary } from '@mudanzapp/shared';

import { DashboardDenialComponent } from '../events/dashboard-denial.component';
import { EventContextComponent } from '../events/event-context.component';
import { EventItemsStore } from '../events/event-items.store';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { ItemPhotoComponent } from './item-photo.component';
import { itemStatusClasses, itemStatusLabel } from './item-status';

/**
 * Pestaña `Capturados`: la lista de artículos del evento con su estado (`plan-ciclo-3d` §5).
 *
 * Desde el ciclo 4b la fila muestra el precio, abre la página de edición y ofrece `Marcar vendido`
 * con confirmación en dos toques. El estado sale de `publishedSlug` —leído de `app.listing` en cada
 * lectura—, de `unpublishedAt` y de `soldAt`; recargar no lo pierde. Vender no borra: la ficha y su
 * enlace se conservan.
 *
 * Desde F3 una ficha despublicada conserva su `slug` pero no ofrece enlace ni venta: ofrece
 * `Republicar`, que devuelve la misma URL al catálogo. `Despublicar` es reversible y por eso no pide
 * confirmación; `Marcar vendido` sí la pide porque no tiene reversa.
 *
 * El recurso lo posee el marco del evento, no esta pestaña: el contador de la barra y la lista tienen
 * que salir de la misma lectura.
 */
@Component({
  selector: 'app-item-list',
  imports: [
    DashboardDenialComponent,
    EventContextComponent,
    ItemPhotoComponent,
    RouterLink,
    UiCardComponent,
  ],
  templateUrl: './item-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListComponent {
  protected readonly store = inject(EventItemsStore);

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /** Estado visible y su color: la regla vive en `item-status` y la comparte el dashboard. */
  protected readonly statusLabel = itemStatusLabel;
  protected readonly statusClasses = itemStatusClasses;

  /** Artículo cuyo botón de venta ya se pulsó una vez y espera la confirmación. */
  protected readonly confirmingSoldId = signal<string | null>(null);

  /** Enlace público del artículo, o `null` mientras no esté publicado o esté despublicado. */
  protected linkFor(item: ItemSummary): string | null {
    return item.publishedSlug === null || item.unpublishedAt !== null
      ? null
      : this.store.linkForSlug(item.publishedSlug);
  }

  /**
   * La venta no tiene reversa desde la interfaz (decisión §40), así que el primer toque arma la
   * confirmación y el segundo escribe `sold_at`. Cualquier otro toque en otra fila desarma la
   * anterior.
   */
  protected confirmSold(item: ItemSummary): void {
    if (this.confirmingSoldId() === item.id) {
      this.confirmingSoldId.set(null);
      void this.store.sell(item);
      return;
    }

    this.confirmingSoldId.set(item.id);
  }
}
