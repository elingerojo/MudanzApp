import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { brand } from '@mudanzapp/shared';

import { AccountLinkComponent } from './session/account-link.component';
import { InviteDeviceComponent } from './session/invite-device.component';
import { SessionStore } from './session/session.store';
import { uiButtonClasses } from './ui/ui-button/ui-button';

/** Una entrada de la navegación principal. */
interface Destination {
  readonly path: string;
  readonly label: string;
  readonly testId: string;
  /** Glifo decorativo: la etiqueta es el nombre visible y accesible. */
  readonly icon: string;
}

/**
 * Marco de la aplicación: cabecera persistente, navegación y contenedor del `router-outlet`.
 *
 * Vive en el componente raíz —siempre montado— y no en una pantalla, para que navegar no desmonte
 * la navegación ni el estado que refleja. La barra se deriva de las secciones que **existen**: un
 * destino nace con su capacidad, y mientras haya uno solo no se dibuja (no hay nada entre lo que
 * navegar). Agregar una sección es agregar un destino aquí y su ruta en `app.routes.ts`.
 *
 * La cabecera se simplifica sin sesión: un dispositivo sin credencial solo puede canjear, y el
 * inicio ya ofrece ese camino.
 */
@Component({
  selector: 'app-root',
  imports: [
    AccountLinkComponent,
    InviteDeviceComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly appName = brand.publicName;

  private readonly title = inject(Title);
  private readonly session = inject(SessionStore);

  protected readonly hasSession = this.session.hasSession;
  protected readonly user = this.session.user;
  protected readonly signOutClasses = uiButtonClasses('danger');

  protected readonly destinations = computed<readonly Destination[]>(() => {
    const [event] = this.session.events();
    if (event === undefined) {
      return [];
    }

    return [
      {
        path: `/eventos/${event.id}`,
        label: 'Artículos',
        icon: '📦',
        testId: 'shell-event-link',
      },
    ];
  });

  /** Con un solo destino la barra no aporta: se omite hasta que exista una segunda sección. */
  protected readonly showNavigation = computed(() => this.destinations().length > 1);

  constructor() {
    // La marca vive en `shared/src/brand.json`; el título del documento se deriva de ahí.
    this.title.setTitle(brand.publicName);
  }

  protected signOut(): void {
    this.session.clear();
  }
}
