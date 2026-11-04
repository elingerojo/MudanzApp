import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { IssuedSession } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { deviceLabel } from './device-label';
import { SHOP_OAUTH_FLOW } from './shop-oauth-flow';
import { shopAccountFailureMessage } from './shop-oauth-message';
import { ShopSessionStore } from './shop-session.store';

/**
 * Vuelta del proveedor en la tienda (`/auth/callback`, ciclo 4d).
 *
 * Dos pasos y ninguno más: completar el flujo —que valida el `state` y devuelve el `id_token`— y
 * entregar ese token a `POST /auth/shop/sessions`, que registra al visitante si es su primer acceso o
 * reusa su cuenta. La ruta es pública a propósito: llega un navegador recién redirigido.
 */
@Component({
  selector: 'app-shop-oauth-callback',
  imports: [RouterLink],
  templateUrl: './shop-oauth-callback.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopOAuthCallbackComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly session = inject(ShopSessionStore);
  private readonly flow = inject(SHOP_OAUTH_FLOW);

  protected readonly failed = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.complete();
  }

  private async complete(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;

    try {
      const result = await this.flow.complete({
        code: query.get('code'),
        state: query.get('state'),
        error: query.get('error'),
      });

      const issued = await firstValueFrom(
        this.http.post<IssuedSession>(`${this.apiBaseUrl}/auth/shop/sessions`, {
          oauthToken: result.idToken,
          deviceLabel: deviceLabel(),
        }),
      );

      this.session.establish(issued);
      await this.router.navigate(['/cuenta'], { replaceUrl: true });
    } catch (failure: unknown) {
      this.failed.set(true);
      this.error.set(shopAccountFailureMessage(failure));
    }
  }
}
