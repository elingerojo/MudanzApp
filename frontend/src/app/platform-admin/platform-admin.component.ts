import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AdminEventSummary, CreatedInvitation } from '@mudanzapp/shared';

import { UiCardComponent } from '../ui/ui-card/ui-card';
import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { PlatformAdminStore } from './platform-admin.store';

/** La emisión que la pantalla enseña una sola vez: el token de la invitación no se recupera. */
interface IssuedLink {
  readonly event: AdminEventSummary;
  readonly invitation: CreatedInvitation;
}

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

/**
 * Administración de plataforma (ciclo E1, decisión §46).
 *
 * Es la pantalla que sustituye al `curl` para el alta: ver todos los eventos, crear uno y emitir su
 * enlace. La puerta es la credencial escrita en el formulario, no una sesión, y la credencial vive
 * solo en la memoria de la pestaña —recargar la pierde y la pantalla no lo esconde—.
 *
 * Lo que **no** hace también es el corte: no edita ni borra eventos, no recuerda la credencial y no
 * pinta nada sin haberla comprobado contra el borde.
 */
@Component({
  selector: 'app-platform-admin',
  imports: [UiCardComponent],
  templateUrl: './platform-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformAdminComponent {
  protected readonly store = inject(PlatformAdminStore);

  protected readonly primaryClasses = uiButtonClasses('primary');
  protected readonly dangerClasses = uiButtonClasses('danger');

  protected readonly token = signal('');
  protected readonly originCity = signal('');
  protected readonly destinationCity = signal('');
  protected readonly issued = signal<IssuedLink | null>(null);

  protected readonly canCreate = computed(
    () => this.originCity().trim().length > 0 && this.destinationCity().trim().length > 0,
  );

  protected setToken(event: Event): void {
    this.token.set(inputValue(event));
  }

  protected setOriginCity(event: Event): void {
    this.originCity.set(inputValue(event));
  }

  protected setDestinationCity(event: Event): void {
    this.destinationCity.set(inputValue(event));
  }

  protected async signIn(): Promise<void> {
    this.issued.set(null);
    await this.store.signIn(this.token());
  }

  /** Salir borra también lo escrito: la credencial no se queda ni en el campo. */
  protected signOut(): void {
    this.token.set('');
    this.issued.set(null);
    this.store.signOut();
  }

  protected async loadMore(): Promise<void> {
    const cursor = this.store.nextCursor();
    if (cursor !== null) {
      await this.store.load(cursor);
    }
  }

  protected async submitCreate(event: Event): Promise<void> {
    event.preventDefault();

    const originCity = this.originCity().trim();
    const destinationCity = this.destinationCity().trim();
    if (originCity.length === 0 || destinationCity.length === 0) {
      return;
    }

    if (await this.store.createEvent({ originCity, destinationCity })) {
      this.originCity.set('');
      this.destinationCity.set('');
    }
  }

  protected async issue(event: AdminEventSummary): Promise<void> {
    const invitation = await this.store.issueInvitation(event.id);
    this.issued.set(invitation === null ? null : { event, invitation });
  }

  /** El evento sigue existiendo sin administrador: la pantalla lo dice en vez de dejarlo vacío. */
  protected administratorLabel(event: AdminEventSummary): string {
    return event.administratorName ?? 'sin administrador';
  }

  protected day(iso: string): string {
    return iso.slice(0, 10);
  }

  /**
   * El enlace que se comparte es el de la propia aplicación, con el token en la query: es la misma
   * forma que `RedeemComponent` acepta y no inventa una ruta nueva.
   */
  protected invitationUrl(invitation: CreatedInvitation): string {
    return `${globalThis.location.origin}/invitacion?token=${encodeURIComponent(invitation.token)}`;
  }
}
