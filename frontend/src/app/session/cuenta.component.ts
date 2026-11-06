import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { eventPublicUrl } from '../events/event-public-url';
import { SHOP_BASE_URL } from '../shop-base-url.token';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { AccountLinkComponent } from './account-link.component';
import { InviteDeviceComponent } from './invite-device.component';
import { SessionStore } from './session.store';

/**
 * Pantalla `Cuenta` del corte D8.
 *
 * Es el tercer destino de la barra inferior. Reúne lo que antes vivía en el popover de la cabecera
 * —identidad y dispositivo, vincular cuenta, invitar otro dispositivo, canjear otra invitación y
 * cerrar sesión— y añade el enlace del evento y el acceso al dashboard.
 *
 * D9 queda abierta para el pulido de esta pantalla y D10 para mover la administración del evento a
 * una ruta hija. Aquí la Cuenta solo deja de ser un popover.
 */
@Component({
  selector: 'app-cuenta',
  imports: [AccountLinkComponent, InviteDeviceComponent, RouterLink, UiCardComponent],
  templateUrl: './cuenta.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CuentaComponent {
  private readonly session = inject(SessionStore);
  private readonly shopBaseUrl = inject(SHOP_BASE_URL);
  private readonly router = inject(Router);

  protected readonly user = this.session.user;
  protected readonly event = this.session.activeEvent;
  protected readonly signOutClasses = uiButtonClasses('danger');

  protected readonly publicUrl = computed(() => {
    const event = this.event();
    return event === null ? null : eventPublicUrl(event.publicSlug, this.shopBaseUrl);
  });

  protected signOut(): void {
    this.session.clear();
    void this.router.navigate(['/']);
  }
}
