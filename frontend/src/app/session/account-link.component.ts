import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { OAUTH_FLOW } from './oauth-flow';
import { oauthFailureMessage } from './oauth-message';
import { SessionStore } from './session.store';

/**
 * `Vincular cuenta` dentro de la Cuenta del marco (ciclo 4c-1, `oauth-login`).
 *
 * Es la puerta que el producto no tenía: el co-dispositivo convierte su sesión de evento en una **de
 * cuenta** sin teclear nada. Solo aparece sin sujeto —un dispositivo que ya tiene cuenta no vuelve a
 * reclamar, y el backend responde `session_not_claimable` si se intentara—.
 *
 * El componente no compone el flujo: delega en `OAuthFlow`, que en producción habla con el proveedor y
 * en desarrollo y en el arnés es un doble determinista.
 */
@Component({
  selector: 'app-account-link',
  templateUrl: './account-link.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountLinkComponent {
  private readonly session = inject(SessionStore);
  private readonly flow = inject(OAUTH_FLOW);

  /** Sin cuenta vinculada: es exactamente el estado que el reclamo resuelve. */
  protected readonly visible = computed(() => this.session.user() === null);

  protected readonly connecting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async link(): Promise<void> {
    if (this.connecting()) {
      return;
    }

    this.connecting.set(true);
    this.error.set(null);

    try {
      await this.flow.begin();
    } catch (failure: unknown) {
      this.error.set(oauthFailureMessage(failure));
    } finally {
      this.connecting.set(false);
    }
  }
}
