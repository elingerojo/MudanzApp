import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';

import { SHOP_OAUTH_FLOW } from './shop-oauth-flow';
import { shopAccountFailureMessage } from './shop-oauth-message';
import { clearShopReturnTo, saveShopReturnTo } from './shop-return-to';
import { ShopSessionStore } from './shop-session.store';

/**
 * Acceso opcional a la cuenta desde las páginas públicas de la tienda (extensión de 4d).
 *
 * El enlace del evento y la ficha se leen sin sesión. Esta barra no los protege: ofrece `Entrar` a
 * quien quiera tener cuenta —el interés de compra de 4e la exigirá— y, si ya entró, muestra su nombre y
 * la salida local. Al entrar desde una página pública, el regreso vuelve a esa misma página.
 *
 * En `/cuenta` y en `/auth/callback` la barra se oculta: esas pantallas ya tienen su propio control y
 * repetirlo confundiría la vuelta del proveedor.
 */
@Component({
  selector: 'app-shop-account-bar',
  imports: [RouterLink],
  templateUrl: './shop-account-bar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopAccountBarComponent {
  private readonly session = inject(ShopSessionStore);
  private readonly flow = inject(SHOP_OAUTH_FLOW);
  private readonly router = inject(Router);

  protected readonly user = this.session.user;
  protected readonly connecting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly hidden = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.isHidden(event.urlAfterRedirects)),
    ),
    { initialValue: this.isHidden(this.router.url) },
  );

  protected async signIn(): Promise<void> {
    if (this.connecting()) {
      return;
    }

    this.connecting.set(true);
    this.error.set(null);

    try {
      saveShopReturnTo(this.router.url);
      await this.flow.begin();
    } catch (failure: unknown) {
      clearShopReturnTo();
      this.error.set(shopAccountFailureMessage(failure));
    } finally {
      this.connecting.set(false);
    }
  }

  protected signOut(): void {
    this.session.clear();
    this.error.set(null);
  }

  private isHidden(url: string): boolean {
    return url.startsWith('/cuenta') || url.startsWith('/auth/callback');
  }
}
