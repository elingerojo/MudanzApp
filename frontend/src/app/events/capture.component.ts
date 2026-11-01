import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ItemFormComponent } from '../items/item-form.component';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { EventItemsStore } from './event-items.store';

/**
 * Pestaña `Captura` de la sección del evento (`plan-ciclo-3d` §5 y §6).
 *
 * Es el host del formulario y del resultado de la captura: **no** cambia de pestaña al publicar, para
 * que una sesión de cuarenta artículos no pague un salto por ficha. Lo que hace es mostrar el enlace
 * recién creado y ofrecer `Capturados` como enlace explícito.
 */
@Component({
  selector: 'app-capture',
  imports: [ItemFormComponent, RouterLink, UiCardComponent],
  templateUrl: './capture.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureComponent {
  private readonly store = inject(EventItemsStore);

  protected readonly eventId = this.store.eventId;
  protected readonly capturedPath = ['/eventos', this.eventId, 'capturados'];

  /** `undefined` = nada nuevo; `null` = guardado sin publicar; `string` = `slug` publicado. */
  protected readonly last = signal<string | null | undefined>(undefined);

  protected readonly publishedLink = computed(() => {
    const slug = this.last();
    return typeof slug === 'string' ? this.store.linkForSlug(slug) : null;
  });

  protected onSaved(slug: string | null): void {
    this.last.set(slug);
    this.store.reload();
  }
}
