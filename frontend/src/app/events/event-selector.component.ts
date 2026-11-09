import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { EventRole, EventSummary } from '@mudanzapp/shared';

import { SessionStore } from '../session/session.store';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { eventTitle } from './event-title';

/**
 * Selector de mudanza (corte D2).
 *
 * Es la pantalla a la que una cuenta con dos o más membresías llega al entrar y a la que la guarda
 * de los destinos privados devuelve cuando no hay elección. Publica la lista que el borde ya entrega
 * en `/auth/session` —trayecto y rol— y no inventa ninguna: elegir fija la elección del store y
 * navega a `/inicio`, la bienvenida que pide la primera foto (corte D13).
 *
 * Con una sola membresía la pantalla no se visita: la guarda no interviene y el aterrizaje directo
 * se conserva. Sin evento, el camino de vuelta sigue siendo el enlace.
 */
@Component({
  selector: 'app-event-selector',
  imports: [RouterLink, UiCardComponent],
  templateUrl: './event-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventSelectorComponent {
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);

  protected readonly events = this.session.events;
  protected readonly loading = this.session.identityLoading;

  /** La sesión existe pero el backend no la reconoce: el canje es el camino de vuelta. */
  protected readonly sessionInvalid = this.session.identityFailed;
  protected readonly activeEventId = this.session.activeEventId;

  /** Cada fila es un botón completo: el trayecto es el nombre visible y accesible. */
  protected readonly rowClasses = `${uiButtonClasses('secondary')} w-full justify-start text-left`;

  protected title(event: EventSummary): string {
    return eventTitle(event);
  }

  protected roleLabel(role: EventRole | null): string {
    if (role === 'owner') {
      return 'Administras esta mudanza';
    }

    if (role === 'member') {
      return 'Co-dispositivo de esta mudanza';
    }

    return 'Dispositivo de esta mudanza';
  }

  protected choose(event: EventSummary): void {
    if (!this.session.selectEvent(event.id)) {
      return;
    }

    void this.router.navigate(['/inicio']);
  }
}
