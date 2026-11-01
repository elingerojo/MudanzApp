import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { ItemSummary } from '@mudanzapp/shared';

import { EventItemsStore } from '../events/event-items.store';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { ItemPhotoComponent } from './item-photo.component';

/**
 * Pestaña `Capturados`: la lista de artículos del evento con su estado (`plan-ciclo-3d` §5).
 *
 * Antes vivía dentro de la pantalla de captura y el estado publicado se guardaba en memoria, así que
 * recargar lo perdía. Ahora el indicador sale de `publishedSlug`, que viene de `app.listing` en cada
 * lectura, y la lista solo tiene dos acciones: publicar lo que está `en proceso` y copiar el enlace de
 * lo `publicado`.
 *
 * El recurso lo posee el marco del evento, no esta pestaña: el contador de la barra y la lista tienen
 * que salir de la misma lectura.
 */
@Component({
  selector: 'app-item-list',
  imports: [ItemPhotoComponent, UiCardComponent],
  templateUrl: './item-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemListComponent {
  protected readonly store = inject(EventItemsStore);

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly secondaryClasses = uiButtonClasses('secondary');

  /** Enlace público del artículo, o `null` mientras no esté publicado. */
  protected linkFor(item: ItemSummary): string | null {
    return item.publishedSlug === null ? null : this.store.linkForSlug(item.publishedSlug);
  }
}
