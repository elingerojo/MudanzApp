import { randomUUID } from 'node:crypto';

import type { ItemPhotoVariant } from '@mudanzapp/shared';

import type { StorageConfig } from '../config.js';
import { AppError } from '../errors.js';
import { createFileObjectStore } from './r2-fake.js';
import { createR2ObjectStore, createS3Client } from './r2-live.js';

/**
 * Costura de almacenamiento de objetos (`R2_MODE`).
 *
 * Tres operaciones y nada más: escribir un objeto, leerlo con credencial y resolver su dirección
 * pública. La lectura pública de §26 vive **detrás** de esta interfaz, no en la ruta, así que el
 * doble `fake` sustituye también la URL que ve el visitante y ninguna prueba depende de R2 real.
 *
 * El modo se lee solo porque la capacidad existe (`00-stack` §Integraciones). `fake` y `live` están
 * implementados; un modo desconocido falla con un código estable en la primera petición que lo usa,
 * en vez de fingir que guardó algo.
 */
export interface StoredObject {
  readonly bytes: Buffer;
  readonly contentType: string;
}

export interface ObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  /** Dirección de lectura pública del objeto: la emite el backend, el navegador descarga del almacén. */
  publicUrl(key: string): string;
}

/**
 * Clave del objeto: identifica el evento y el artículo para que un volcado del almacén sea legible,
 * añade un identificador aleatorio para que reemplazar una foto nunca sobrescriba otra, y termina en
 * el nombre de la variante, que es lo que hace legible un volcado del bucket
 * (`plan-ciclo-3c-optimizar` §5). La unicidad la sigue dando el `uuid`; el `object_key` es del
 * almacén y la dirección estable que ve el cliente es `app.item_photo.id`.
 */
export function newObjectKey(eventId: string, itemId: string, variant: ItemPhotoVariant): string {
  return `${eventId}/${itemId}/${randomUUID()}-${variant}`;
}

/** Almacén que siempre rechaza con el código que explica por qué no hay almacén. */
function unavailable(code: 'r2_mode_invalid' | 'r2_not_configured'): ObjectStore {
  const reject = (): Promise<never> => Promise.reject(new AppError(code));
  const refuse = (): never => {
    throw new AppError(code);
  };

  return { put: reject, get: reject, publicUrl: refuse };
}

/**
 * Elige el adaptador por el modo declarado. Un modo desconocido y un `live` incompleto son fallos
 * distintos: el primero es configuración inválida, el segundo una capacidad a la que le faltan
 * piezas. `R2_PUBLIC_BASE_URL` es una de ellas desde 3c, porque la ficha pública la publica.
 */
export function createObjectStore(config: StorageConfig): ObjectStore {
  if (config.mode === 'fake') {
    return createFileObjectStore();
  }

  if (config.mode !== 'live') {
    return unavailable('r2_mode_invalid');
  }

  const { bucket, endpoint, accessKeyId, secretAccessKey, publicBaseUrl } = config;
  if (
    bucket === null ||
    endpoint === null ||
    accessKeyId === null ||
    secretAccessKey === null ||
    publicBaseUrl === null
  ) {
    return unavailable('r2_not_configured');
  }

  return createR2ObjectStore({
    client: createS3Client({ endpoint, accessKeyId, secretAccessKey }),
    bucket,
    publicBaseUrl,
  });
}
