import { randomUUID } from 'node:crypto';

import type { ItemPhotoVariant } from '@mudanzapp/shared';

import type { StorageConfig } from '../config.js';
import { AppError } from '../errors.js';
import { createFileObjectStore } from './r2-fake.js';
import { createR2ObjectStore, createR2Presigner, createS3Client } from './r2-live.js';

/**
 * Costura de almacenamiento de objetos (`R2_MODE`).
 *
 * Siete operaciones y nada más: escribir, leer con credencial, resolver la dirección pública,
 * prefirmar una escritura, leer metadatos, copiar y borrar. La lectura pública de §26 vive
 * **detrás** de esta interfaz, no en la ruta, así que el doble `fake` sustituye también la URL que
 * ve el visitante y ninguna prueba depende de R2 real.
 *
 * Desde el ciclo 4g (`direct-upload`) el navegador escribe en el almacén con una URL prefirmada y el
 * backend sólo verifica (`head`), mueve (`copy`) y limpia (`delete`); por eso esas tres operaciones
 * entran en la costura en vez de vivir en la ruta.
 *
 * El modo se lee solo porque la capacidad existe (`00-stack` §Integraciones). `fake` y `live` están
 * implementados; un modo desconocido falla con un código estable en la primera petición que lo usa,
 * en vez de fingir que guardó algo.
 */
export interface StoredObject {
  readonly bytes: Buffer;
  readonly contentType: string;
}

/** Lo que se puede saber de un objeto sin traerlo: su tipo y su peso real. */
export interface ObjectHead {
  readonly contentType: string;
  readonly byteSize: number;
}

/** Entrada del firmado: la clave, el tipo que se firma y cuánto vive la URL. */
export interface PresignPutInput {
  readonly key: string;
  readonly contentType: string;
  readonly expiresInSeconds: number;
}

/** Firma una escritura sin recibir los bytes; se inyecta para probar sin red ni credenciales. */
export type PresignPut = (input: PresignPutInput) => Promise<string>;

export interface ObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  /** Dirección de lectura pública del objeto: la emite el backend, el navegador descarga del almacén. */
  publicUrl(key: string): string;
  /** URL temporal con la que el navegador escribe el objeto sin pasar por el API. */
  presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** Metadatos del objeto, o `null` si no existe. Es la verificación de la adjunción. */
  head(key: string): Promise<ObjectHead | null>;
  /** Copia dentro del mismo almacén, sin traer los bytes al backend. */
  copy(from: string, to: string): Promise<void>;
  /** Borra el objeto; es idempotente y no falla si ya no está. */
  delete(key: string): Promise<void>;
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

  return {
    put: reject,
    get: reject,
    publicUrl: refuse,
    presignPut: reject,
    head: reject,
    copy: reject,
    delete: reject,
  };
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

  const client = createS3Client({ endpoint, accessKeyId, secretAccessKey });

  return createR2ObjectStore({
    client,
    bucket,
    publicBaseUrl,
    presign: createR2Presigner(client, bucket),
  });
}
