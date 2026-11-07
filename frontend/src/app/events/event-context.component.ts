import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { eventPublicUrl } from './event-public-url';
import { eventTitle } from './event-title';

/**
 * Contexto del evento activo para las pantallas raíz (corte D8).
 *
 * Reemplaza la cabecera que vivía en `EventComponent`: el título del trayecto, el enlace público y el
 * aviso de sesión inválida. La pieza se comparte entre `Captura` y `Capturados` para que el enlace del
 * evento y su título no se compongan dos veces.
 */
@Component({
  selector: 'app-event-context',
  templateUrl: './event-context.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventContextComponent {
  private readonly session = inject(SessionStore);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);

  protected readonly event = this.session.activeEvent;
  protected readonly sessionInvalid = this.session.identityFailed;

  protected readonly title = computed(() => {
    const event = this.event();
    return event === null ? 'Evento' : eventTitle(event);
  });

  protected readonly publicUrl = computed(() => {
    const event = this.event();
    return event === null ? null : eventPublicUrl(event.publicSlug, this.shopBaseUrl);
  });
}
