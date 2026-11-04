/**
 * Memoria del flujo OAuth mientras dura la redirección (ciclos 4c-1 y 4d).
 *
 * El verificador, el `state` y el propósito viven solo el tiempo del viaje al proveedor. El store que
 * esta fábrica construye no conoce `sessionStorage` ni el DOM: recibe una función que devuelve una
 * superficie mínima de almacenamiento, con el respaldo en memoria que necesita el doble `fake`, que
 * navega dentro de la aplicación.
 *
 * Cada superficie compone su propio store con sus claves y su propósito. Así `frontend` conserva sus
 * claves actuales y `shop` usa las suyas, sin compartir estado entre dos flujos que nunca conviven.
 */

/** Para qué se abrió el flujo. `shop` es el registro o regreso de un visitante de la tienda (4d). */
export type OAuthPendingPurpose = 'claim' | 'signin' | 'shop';

export interface PendingOAuthFlow {
  readonly verifier: string;
  readonly state: string;
  readonly purpose: OAuthPendingPurpose;
}

/** Superficie mínima de almacenamiento: la que `sessionStorage` cumple sin arrastrar tipos del DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PendingFlowKeys {
  readonly verifier: string;
  readonly state: string;
  readonly purpose: string;
}

export interface PendingFlowStore {
  /** Guarda el flujo en curso. Devuelve `false` solo si no hay ni memoria ni almacenamiento. */
  save(flow: PendingOAuthFlow): boolean;

  /** El flujo pendiente, o `null` si esta visita no empezó ninguno o el registro está incompleto. */
  read(): PendingOAuthFlow | null;

  /** Se borra al canjear o al fallar: un verificador usado no se reutiliza. */
  clear(): void;
}

/** ¿Es un propósito que cualquier flujo del producto sabe atender? Un valor ajeno no se adivina. */
function isPurpose(value: string | null): value is OAuthPendingPurpose {
  return value === 'claim' || value === 'signin' || value === 'shop';
}

export function createPendingFlowStore(input: {
  readonly storage: () => StorageLike | null;
  readonly keys: PendingFlowKeys;
}): PendingFlowStore {
  /** Copia en memoria: el doble `fake` navega dentro de la aplicación y no siempre toca el disco. */
  let pending: PendingOAuthFlow | null = null;

  return {
    save(flow: PendingOAuthFlow): boolean {
      pending = flow;

      const target = input.storage();
      if (target === null) {
        return true;
      }

      try {
        target.setItem(input.keys.verifier, flow.verifier);
        target.setItem(input.keys.state, flow.state);
        target.setItem(input.keys.purpose, flow.purpose);
        return true;
      } catch {
        // Sin cuota, el flujo sigue con la copia en memoria; una recarga completa lo perdería.
        return true;
      }
    },

    read(): PendingOAuthFlow | null {
      if (pending !== null) {
        return pending;
      }

      const target = input.storage();
      if (target === null) {
        return null;
      }

      try {
        const verifier = target.getItem(input.keys.verifier);
        const state = target.getItem(input.keys.state);
        const purpose = target.getItem(input.keys.purpose);
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
    },

    clear(): void {
      pending = null;

      const target = input.storage();
      if (target === null) {
        return;
      }

      try {
        target.removeItem(input.keys.verifier);
        target.removeItem(input.keys.state);
        target.removeItem(input.keys.purpose);
      } catch {
        // Nada que hacer: la copia en memoria ya está fuera.
      }
    },
  };
}
