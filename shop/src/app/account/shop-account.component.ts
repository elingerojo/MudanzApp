import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';

import { SHOP_OAUTH_FLOW } from '../session/shop-oauth-flow';
import { shopAccountFailureMessage } from '../session/shop-oauth-message';
import { ShopSessionStore } from '../session/shop-session.store';

/**
 * La cuenta del visitante en la tienda (ciclo 4d, `shop-account`).
 *
 * Sin sesión ofrece `Entrar o registrarme`; con sesión muestra el nombre del perfil y permite **fijarlo
 * después**, que es el único dato opcional del corte. `Cerrar sesión` es local, igual que en la Cuenta
 * del marco: el token deja de viajar y la fila del servidor queda para su revocación por base.
 */
@Component({
  selector: 'app-shop-account',
  templateUrl: './shop-account.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopAccountComponent {
  private readonly session = inject(ShopSessionStore);
  private readonly flow = inject(SHOP_OAUTH_FLOW);

  protected readonly hasSession = this.session.hasSession;
  protected readonly current = computed(() => this.session.user());
  protected readonly identityFailed = this.session.identityFailed;

  /** El formulario parte del nombre actual y se recompone cuando la identidad se vuelve a leer. */
  protected readonly name = linkedSignal(() => this.session.user()?.displayName ?? '');

  protected readonly connecting = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async signIn(): Promise<void> {
    if (this.connecting()) {
      return;
    }

    this.connecting.set(true);
    this.error.set(null);
    this.saved.set(false);

    try {
      await this.flow.begin();
    } catch (failure: unknown) {
      this.error.set(shopAccountFailureMessage(failure));
    } finally {
      this.connecting.set(false);
    }
  }

  protected signOut(): void {
    this.session.clear();
    this.error.set(null);
    this.saved.set(false);
  }

  protected onName(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input !== null) {
      this.name.set(input.value);
    }
  }

  protected async saveName(): Promise<void> {
    if (this.saving()) {
      return;
    }

    const displayName = this.name().trim();
    if (displayName.length === 0) {
      this.error.set('Escribe un nombre para guardarlo.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);

    try {
      await this.session.updateDisplayName(displayName);
      this.saved.set(true);
    } catch (failure: unknown) {
      this.error.set(shopAccountFailureMessage(failure));
    } finally {
      this.saving.set(false);
    }
  }
}
