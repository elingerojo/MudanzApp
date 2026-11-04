/**
 * Página a la que vuelve el visitante después de autenticarse (extensión de 4d).
 *
 * El enlace público del evento y la ficha son anónimos; si el visitante decide entrar desde ahí, el
 * regreso debe dejarlo en la misma página y no en `/cuenta`. La ruta vive en `sessionStorage` —el
 * viaje al proveedor puede recargar el documento— y una ruta externa se rechaza: el regreso nunca es
 * un destino que el flujo no controla.
 */
const RETURN_TO_KEY = 'mudanzapp.shop.oauth.return';

/** Copia en memoria: el doble `fake` navega dentro de la aplicación y no siempre toca el disco. */
let pending: string | null = null;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function saveShopReturnTo(path: string): void {
  pending = path;

  const target = storage();
  if (target === null) {
    return;
  }

  try {
    target.setItem(RETURN_TO_KEY, path);
  } catch {
    // Sin cuota, el regreso sigue con la copia en memoria.
  }
}

export function readShopReturnTo(): string | null {
  if (pending !== null) {
    return pending;
  }

  const target = storage();
  if (target === null) {
    return null;
  }

  try {
    const stored = target.getItem(RETURN_TO_KEY);
    if (stored === null || stored.length === 0) {
      return null;
    }

    pending = stored;
    return pending;
  } catch {
    return null;
  }
}

export function clearShopReturnTo(): void {
  pending = null;

  const target = storage();
  if (target === null) {
    return;
  }

  try {
    target.removeItem(RETURN_TO_KEY);
  } catch {
    // Nada que hacer: la copia en memoria ya está fuera.
  }
}

/** Solo una ruta interna del mapa público; cualquier otra cosa vuelve a la cuenta. */
export function safeShopReturnTo(value: string | null): string {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) {
    return '/cuenta';
  }

  // La vuelta del proveedor y la cuenta ya tienen su propio destino; no se reabren desde aquí.
  if (value.startsWith('/auth/')) {
    return '/cuenta';
  }

  return value;
}
