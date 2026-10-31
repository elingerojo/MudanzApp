import { randomUUID } from 'node:crypto';

import type { StorageConfig } from '../config.js';
import { AppError } from '../errors.js';
import { createFileObjectStore } from './r2-fake.js';

/**
 * Costura de almacenamiento de objetos (`R2_MODE`).
 *
 * Dos operaciones y nada más: escribir un objeto y leerlo. La foto del artículo no necesita listar,
 * borrar ni firmar todavía; la lectura pública de §26 llega con `publish` y, cuando llegue, se
 * resolverá **detrás** de esta misma interfaz, no en la ruta.
 *
 * El modo se lee solo porque la capacidad existe (`00-stack` §Integraciones). `fake` está
 * implementado; `live` no tiene adaptador todavía y falla con un código estable en la primera
 * petición que lo usa, en vez de fingir que guardó algo.
 */
export interface StoredObject {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface ObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
}

/**
 * Clave del objeto: identifica el evento y el artículo para que un volcado del almacén sea legible,
 * y añade un identificador aleatorio para que reemplazar una foto nunca sobrescriba otra. El
 * `object_key` es del almacén; la dirección estable que ve el cliente es `app.item_photo.id`.
 */
export function newObjectKey(eventId: string, itemId: string): string {
  return `${eventId}/${itemId}/${randomUUID()}`;
}

/** Almacén que siempre rechaza con el código que explica por qué no hay almacén. */
function unavailable(code: 'r2_mode_invalid' | 'r2_live_unavailable'): ObjectStore {
  const reject = (): Promise<never> => Promise.reject(new AppError(code));

  return { put: reject, get: reject };
}

/**
 * Elige el adaptador por el modo declarado. Un modo desconocido y un `live` sin adaptador son fallos
 * distintos: el primero es configuración inválida, el segundo una capacidad todavía no construida.
 */
export function createObjectStore(config: StorageConfig): ObjectStore {
  if (config.mode === 'fake') {
    return createFileObjectStore();
  }

  if (config.mode === 'live') {
    return unavailable('r2_live_unavailable');
  }

  return unavailable('r2_mode_invalid');
}
