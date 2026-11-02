import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { EventItemsStore } from './event-items.store';

/**
 * Marco de la sección del evento (`plan-ciclo-3d` §5).
 *
 * Desde 3d esta pantalla **no** captura ni lista: sostiene la barra de dos pestañas —`Captura` y
 * `Capturados`—, la cabecera con el estado de la sesión y el recurso de artículos que ambas comparten.
 * Las pestañas son rutas hijas, así que la sección sigue siendo un solo destino del mapa y la barra
 * global de la aplicación no cambia.
 *
 * El contador de `Capturados` sale del mismo `httpResource` que pinta la lista: publicar en la captura
 * recarga una sola vez y las dos pestañas ven el mismo número.
 */
@Component({
  selector: 'app-event',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [EventItemsStore],
  templateUrl: './event.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionStore);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);

  /** El recurso de artículos de la sección; lo consumen las dos pestañas y el contador. */
  protected readonly store = inject(EventItemsStore);

  protected readonly eventId = this.route.snapshot.paramMap.get('eventId') ?? '';

  /** Ciudades del evento, cuando la identidad de la sesión ya las conoce. */
  protected readonly event = computed(() => this.session.eventById(this.eventId));

  /**
   * Enlace público del índice, visible y copiable desde que el evento se crea (decisión §36). El
   * origen de `shop` es configuración compilada y el `publicSlug` lo emite el backend: el frontend no
   * compone ninguno de los dos.
   */
  protected readonly publicUrl = computed(() => {
    const event = this.event();
    return event === null ? null : `${this.shopBaseUrl}/evento/${event.publicSlug}`;
  });

  protected readonly sessionInvalid = this.session.identityFailed;

  /** `true` mientras la ruta activa sea la de `Capturados`, para marcar la pestaña. */
  protected readonly capturedPath = ['/eventos', this.eventId, 'capturados'];
  protected readonly capturePath = ['/eventos', this.eventId];
}
