import type { OAuthPurpose } from './oauth-flow';

/**
 * Memoria del flujo de identidad mientras dura la redirección (ciclos 4c-1 y 4c-1c).
 *
 * El verificador, el `state` y el **propósito** viven **solo** el tiempo del viaje al proveedor:
 * `sessionStorage` los pierde al cerrar la pestaña y `clearPendingFlow()` los borra en cuanto se
 * canjean, así que no son una credencial en disco (decisión §27). Se guarda además una copia en
 * memoria para que el doble `fake`, que navega dentro de la aplicación, no dependa del almacenamiento.
 *
 * Un registro sin propósito reconocible se descarta al leer: sin saber a qué se vino no se canjea nada.
 */

const VERIFIER_KEY = 'mudanzapp.oauth.verifier';
const STATE_KEY = 'mudanzapp.oauth.state';
const PURPOSE_KEY = 'mudanzapp.oauth.purpose';

export interface PendingOAuthFlow {
  readonly verifier: string;
  readonly state: string;
  readonly purpose: OAuthPurpose;
}

let pending: PendingOAuthFlow | null = null;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    // Un navegador que niega el almacenamiento no rompe el flujo: queda la copia en memoria.
    return null;
  }
}

/** ¿Es un propósito que este flujo sabe atender? Un valor ajeno no se adivina. */
function isPurpose(value: string | null): value is OAuthPurpose {
  return value === 'claim' || value === 'signin';
}

/**
 * Guarda el flujo en curso. Devuelve `false` solo cuando no hay ni memoria ni almacenamiento, que es
 * el caso en el que la vuelta del proveedor no podría verificarse y el flujo no debe empezar.
 */
export function savePendingFlow(flow: PendingOAuthFlow): boolean {
  pending = flow;

  const target = storage();
  if (target === null) {
    return true;
  }

  try {
    target.setItem(VERIFIER_KEY, flow.verifier);
    target.setItem(STATE_KEY, flow.state);
    target.setItem(PURPOSE_KEY, flow.purpose);
    return true;
  } catch {
    // Sin cuota, el flujo sigue con la copia en memoria; una recarga completa lo perdería.
    return true;
  }
}

/** El flujo pendiente, o `null` si esta visita no empezó ninguno o el registro está incompleto. */
export function readPendingFlow(): PendingOAuthFlow | null {
  if (pending !== null) {
    return pending;
  }

  const target = storage();
  if (target === null) {
    return null;
  }

  try {
    const verifier = target.getItem(VERIFIER_KEY);
    const state = target.getItem(STATE_KEY);
    const purpose = target.getItem(PURPOSE_KEY);
    if (verifier === null || state === null || verifier.length === 0 || state.length === 0) {
      return null;
    }

    if (!isPurpose(purpose)) {
      return null;
    }

    pending = { verifier, state, purpose };
    return pending;
  } catch {
    return null;
  }
}

/** Se borra al canjear o al fallar: un verificador usado no se reutiliza. */
export function clearPendingFlow(): void {
  pending = null;

  const target = storage();
  if (target === null) {
    return;
  }

  try {
    target.removeItem(VERIFIER_KEY);
    target.removeItem(STATE_KEY);
    target.removeItem(PURPOSE_KEY);
  } catch {
    // Nada que hacer: la copia en memoria ya está fuera.
  }
}
