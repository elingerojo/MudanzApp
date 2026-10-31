import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { brand } from '@mudanzapp/shared';

import { SessionStore } from '../session/session.store';
import { StatusComponent } from '../status/status.component';
import { UiButtonComponent, uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';

/**
 * Inicio público (`/`).
 *
 * Es la página que un dispositivo **sin** sesión puede usar: dice en qué estado está, ofrece la
 * única acción que le sirve —canjear el enlace— y conserva el humo de estado del backend. Con sesión
 * muestra la cuenta y lleva al evento; la navegación principal vive en el marco (`App`), no aquí.
 */
@Component({
  selector: 'app-home',
  imports: [StatusComponent, UiButtonComponent, UiCardComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly session = inject(SessionStore);

  protected readonly appName = brand.publicName;
  protected readonly hasSession = this.session.hasSession;
  protected readonly user = this.session.user;
  protected readonly identityFailed = this.session.identityFailed;
  protected readonly firstEvent = computed(() => this.session.events()[0] ?? null);

  /** El botón de cerrar sesión no es navegación, así que no usa la primitiva con `link`. */
  protected readonly signOutClasses = uiButtonClasses('danger');

  protected signOut(): void {
    this.session.clear();
  }
}
