import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

import { type DashboardDenial } from '../session/api-error';
import { SessionStore } from '../session/session.store';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { EventItemsStore } from './event-items.store';
import { eventPublicUrl } from './event-public-url';

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
  private readonly router = inject(Router);
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
   * compone ninguno de los dos, solo los une con el ayudante que también usa el panel.
   */
  protected readonly publicUrl = computed(() => {
    const event = this.event();
    return event === null ? null : eventPublicUrl(event.publicSlug, this.shopBaseUrl);
  });

  protected readonly sessionInvalid = this.session.identityFailed;

  /**
   * La familia del fallo vive en la URL (`denied=dashboard&reason=…`), no en un estado del store:
   * recargar la conserva y navegar a otra pestaña la borra. Se relee en cada navegación porque este
   * marco se **reusa** al cambiar de pestaña y su `snapshot` inicial ya no vería el parámetro.
   *
   * `null` significa que no hay aviso. Una URL anterior al diagnóstico del borde (2026-11-04) trae
   * `denied=dashboard` sin `reason`; se lee como rechazo, que es lo único que el guard escribía.
   */
  protected readonly deniedReason = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.deniedFromCurrentUrl()),
    ),
    { initialValue: this.deniedFromCurrentUrl() },
  );

  /** `true` mientras la ruta activa sea la de `Capturados`, para marcar la pestaña. */
  protected readonly capturedPath = ['/eventos', this.eventId, 'capturados'];
  protected readonly capturePath = ['/eventos', this.eventId];
  protected readonly dashboardPath = ['/eventos', this.eventId, 'dashboard'];

  /** Estado inicial del aviso: la URL con la que el navegador ya llegó a esta pantalla. */
  private deniedFromCurrentUrl(): DashboardDenial | null {
    const params = this.router.parseUrl(this.router.url).queryParams;
    if (params['denied'] !== 'dashboard') {
      return null;
    }

    const reason: unknown = params['reason'];
    return reason === 'not_found' || reason === 'unavailable' ? reason : 'forbidden';
  }
}
