import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { brand } from '@mudanzapp/shared';

import { OAUTH_FLOW } from '../session/oauth-flow';
import { oauthFailureMessage } from '../session/oauth-message';
import { SessionStore } from '../session/session.store';
import { StatusComponent } from '../status/status.component';
import { UiButtonComponent, uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';

/**
 * Inicio público (`/`).
 *
 * Ofrece **dos puertas en el orden del producto** (ciclo 4c-1c): primero la **invitación**, que es
 * como se entra la primera vez; después la **cuenta**, que es como se vuelve desde otro dispositivo
 * (decisión §30). El orden se escribe en la plantilla y el e2e lo comprueba, no solo la existencia.
 *
 * Con sesión activa la portada solo resume el estado y lleva al evento; la navegación principal vive
 * en el marco (`App`), no aquí. Este componente no decide acceso: eso es del guard de las rutas.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, StatusComponent, UiButtonComponent, UiCardComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly session = inject(SessionStore);
  private readonly flow = inject(OAUTH_FLOW);

  protected readonly appName = brand.publicName;
  protected readonly hasSession = this.session.hasSession;
  protected readonly user = this.session.user;
  protected readonly identityFailed = this.session.identityFailed;

  /**
   * La portada resume el **evento activo** (corte D2), no el primero de la lista del borde: con una
   * elección explícita, el primero podía ser una mudanza que el usuario no eligió.
   */
  protected readonly activeEvent = this.session.activeEvent;
  protected readonly hasSeveralEvents = computed(() => this.session.events().length > 1);

  /** El botón de cerrar sesión no es navegación, así que no usa la primitiva con `link`. */
  protected readonly signOutClasses = uiButtonClasses('danger');

  /** La puerta de la cuenta solo tiene sentido cuando el dispositivo no tiene sesión utilizable. */
  protected readonly offersAccountDoor = computed(
    () => !this.hasSession() || this.identityFailed(),
  );

  protected readonly connecting = signal(false);
  protected readonly oauthError = signal<string | null>(null);

  /**
   * Regreso con una cuenta ya vinculada: abre el flujo con propósito `signin` y el callback lo canjea
   * contra `POST /auth/sessions`. No pide nada más que la identidad; si la cuenta no tiene evento, el
   * mensaje lo dice y la única salida real sigue siendo el enlace.
   */
  protected async signIn(): Promise<void> {
    if (this.connecting()) {
      return;
    }

    this.connecting.set(true);
    this.oauthError.set(null);

    try {
      await this.flow.begin('signin');
    } catch (failure: unknown) {
      this.oauthError.set(oauthFailureMessage(failure));
    } finally {
      this.connecting.set(false);
    }
  }

  protected signOut(): void {
    this.session.clear();
  }
}
