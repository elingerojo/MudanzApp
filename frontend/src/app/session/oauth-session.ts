import { createPendingFlowStore } from '@mudanzapp/shared';

import type { OAuthPurpose } from './oauth-flow';

/**
 * Memoria del flujo de identidad mientras dura la redirección (ciclos 4c-1 y 4c-1c).
 *
 * El verificador, el `state` y el **propósito** viven **solo** el tiempo del viaje al proveedor:
 * `sessionStorage` los pierde al cerrar la pestaña y `clearPendingFlow()` los borra en cuanto se
 * canjean, así que no son una credencial en disco (decisión §27). El store de `shared` conserva además
 * una copia en memoria para que el doble `fake`, que navega dentro de la aplicación, no dependa del
 * almacenamiento.
 *
 * Esta superficie solo atiende `claim` y `signin`. Un registro marcado `shop` no es una vuelta de esta
 * aplicación y se descarta al leer: sin saber a qué se vino no se canjea nada.
 */

export interface PendingOAuthFlow {
  readonly verifier: string;
  readonly state: string;
  readonly purpose: OAuthPurpose;
}

const store = createPendingFlowStore({
  storage: () => {
    try {
      return globalThis.sessionStorage;
    } catch {
      // Un navegador que niega el almacenamiento no rompe el flujo: queda la copia en memoria.
      return null;
    }
  },
  keys: {
    verifier: 'mudanzapp.oauth.verifier',
    state: 'mudanzapp.oauth.state',
    purpose: 'mudanzapp.oauth.purpose',
  },
});

export function savePendingFlow(flow: PendingOAuthFlow): boolean {
  return store.save(flow);
}

/** El flujo pendiente de esta superficie, o `null` si el registro es de otra o está incompleto. */
export function readPendingFlow(): PendingOAuthFlow | null {
  const flow = store.read();
  if (flow === null || flow.purpose === 'shop') {
    return null;
  }

  return { verifier: flow.verifier, state: flow.state, purpose: flow.purpose };
}

/** Se borra al canjear o al fallar: un verificador usado no se reutiliza. */
export function clearPendingFlow(): void {
  store.clear();
}
