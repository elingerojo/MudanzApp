import { Router } from '@angular/router';
import { createCodeVerifier, createOAuthState, oauthStateMatches } from '@mudanzapp/shared';

import {
  OAuthFlowError,
  type OAuthCallbackParams,
  type OAuthFlow,
  type OAuthPurpose,
  type OAuthResult,
} from './oauth-flow';
import { clearPendingFlow, readPendingFlow, savePendingFlow } from './oauth-session';

/** Código y token del doble: constantes, para que el arnés no dependa de nada externo. */
export const FAKE_OAUTH_CODE = 'fake-authorization-code';
export const FAKE_ID_TOKEN = 'fake-id-token';

/**
 * Doble determinista del flujo (ciclo 4c-1, `stack` §9).
 *
 * No sale del navegador: `begin()` navega a `/auth/callback` con un `code` y el `state` que acaba de
 * guardar, y `complete()` devuelve un `id_token` fijo. El `state` se verifica igual que en `live`,
 * porque la prueba de esa defensa es parte del corte y un doble más permisivo la escondería. El
 * backend corre con `OAUTH_MODE=fake`, así que acepta este token sin proveedor.
 */
export class FakeOAuthFlow implements OAuthFlow {
  constructor(private readonly router: Router) {}

  async begin(purpose: OAuthPurpose): Promise<void> {
    const verifier = createCodeVerifier();
    const state = createOAuthState();
    savePendingFlow({ verifier, state, purpose });

    await this.router.navigate(['/auth/callback'], {
      queryParams: { code: FAKE_OAUTH_CODE, state },
    });
  }

  async complete(params: OAuthCallbackParams): Promise<OAuthResult> {
    if (params.error !== null) {
      clearPendingFlow();
      throw new OAuthFlowError('oauth_denied');
    }

    const pending = readPendingFlow();
    clearPendingFlow();

    if (pending === null || !oauthStateMatches(pending.state, params.state)) {
      throw new OAuthFlowError('oauth_state_mismatch');
    }

    return { idToken: FAKE_ID_TOKEN, purpose: pending.purpose };
  }
}
