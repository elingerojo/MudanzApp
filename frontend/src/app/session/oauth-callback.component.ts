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
 * Vuelta del proveedor (`/auth/callback`, ciclo 4c-1).
 *
 * Dos pasos y ninguno más: completar el flujo —que valida el `state` y devuelve el `id_token`— y
 * entregar ese token a `POST /auth/claim`, que es quien emite la sesión de cuenta y revoca la de
 * evento que se está reclamando. La credencial nueva se guarda en el dispositivo y la pantalla vuelve
 * al evento.
 *
 * La ruta es pública a propósito: llega un navegador recién redirigido, y el guard de sesión no tiene
 * nada que proteger aquí; sin sesión de evento, el reclamo responde `unauthorized`.
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
      const idToken = await this.flow.complete({
        code: query.get('code'),
        state: query.get('state'),
        error: query.get('error'),
      });

      const issued = await firstValueFrom(
        this.http.post<IssuedSession>(`${this.apiBaseUrl}/auth/claim`, {
          oauthToken: idToken,
          deviceLabel: deviceLabel(),
        }),
      );

      this.session.establish(issued);

      const eventId = issued.event?.id ?? null;
      await this.router.navigate(eventId === null ? ['/'] : ['/eventos', eventId], {
        replaceUrl: true,
      });
    } catch (failure: unknown) {
      this.failed.set(true);
      this.error.set(oauthFailureMessage(failure));
    }
  }
}
