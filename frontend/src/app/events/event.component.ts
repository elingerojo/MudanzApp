import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ItemList, ItemSummary } from '@mudanzapp/shared';

import { API_BASE_URL } from '../api-base-url.token';
import { ItemFormComponent } from '../items/item-form.component';
import { ItemPhotoComponent } from '../items/item-photo.component';
import { SessionStore } from '../session/session.store';
import { UiCardComponent } from '../ui/ui-card/ui-card';

/**
 * Sección del evento (`/eventos/:eventId`), con guard.
 *
 * Es la pantalla operativa del ciclo 3a: la lista de artículos del evento y el formulario de
 * captura. La lista es un `httpResource`, así que crear un artículo solo exige recargarla; la foto
 * se pide aparte, con la sesión del dispositivo, porque en este corte no hay URL pública.
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

  /** Una captura nueva invalida la lista: el estado anterior ya no es la verdad. */
  protected reload(): void {
    this.itemsResource.reload();
  }
}
