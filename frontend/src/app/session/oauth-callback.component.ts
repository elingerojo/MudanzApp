import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { IssuedSession } from '@mudanzapp/shared';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../api-base-url.token';
import { deviceLabel } from './device-label';
import { OAUTH_FLOW } from './oauth-flow';
import { oauthFailureMessage } from './oauth-message';
import { SessionStore } from './session.store';

/**
 * Vuelta del proveedor (`/auth/callback`, ciclos 4c-1 y 4c-1c).
 *
 * Dos pasos y ninguno más: completar el flujo —que valida el `state` y devuelve el `id_token` junto al
 * propósito— y entregar ese token a la ruta que corresponda. El **propósito** es lo que distingue los
 * dos caminos del producto y evita adivinarlo por el estado de la sesión:
 *
 * - `claim` → `POST /auth/claim`: este dispositivo tenía una sesión de evento y le añade un sujeto; el
 *   backend revoca esa sesión y emite la de cuenta.
 * - `signin` → `POST /auth/sessions`: el dispositivo llegó sin credencial y vuelve a entrar con una
 *   cuenta ya vinculada. Si esa cuenta no tiene ningún evento, el backend responde
 *   `account_not_linked` y la pantalla lo dice: haber entrado no es tener acceso.
 *
 * La ruta es pública a propósito: llega un navegador recién redirigido, y el guard de sesión no tiene
 * nada que proteger aquí.
 */
@Component({
  selector: 'app-oauth-callback',
  imports: [RouterLink],
  templateUrl: './oauth-callback.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OAuthCallbackComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);
  private readonly session = inject(SessionStore);
  private readonly flow = inject(OAUTH_FLOW);

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

      const path = result.purpose === 'signin' ? '/auth/sessions' : '/auth/claim';
      const issued = await firstValueFrom(
        this.http.post<IssuedSession>(`${this.apiBaseUrl}${path}`, {
          oauthToken: result.idToken,
          deviceLabel: deviceLabel(),
        }),
      );

      this.session.establish(issued);

      const eventId = issued.event?.id ?? null;
      await this.router.navigate(eventId === null ? ['/'] : ['/captura'], {
        replaceUrl: true,
      });
    } catch (failure: unknown) {
      this.failed.set(true);
      this.error.set(oauthFailureMessage(failure));
    }
  }
}
