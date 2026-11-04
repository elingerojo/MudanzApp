import { createPendingFlowStore, type PendingOAuthFlow } from '@mudanzapp/shared';

/**
 * Memoria del flujo de la tienda mientras dura la redirección (ciclo 4d).
 *
 * Usa claves propias y el propósito `shop`, así que nunca comparte estado con el flujo de `frontend`
 * aunque las dos superficies vivan en el mismo navegador. El respaldo en memoria lo aporta el store de
 * `shared`.
 */
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
    verifier: 'mudanzapp.shop.oauth.verifier',
    state: 'mudanzapp.shop.oauth.state',
    purpose: 'mudanzapp.shop.oauth.purpose',
  },
});

export function saveShopPendingFlow(flow: {
  readonly verifier: string;
  readonly state: string;
}): boolean {
  return store.save({ ...flow, purpose: 'shop' });
}

export function readShopPendingFlow(): PendingOAuthFlow | null {
  return store.read();
}

export function clearShopPendingFlow(): void {
  store.clear();
}
