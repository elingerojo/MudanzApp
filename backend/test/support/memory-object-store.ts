import type { ObjectStore } from '../../src/storage/object-store.js';
import { grantFakeUpload } from '../../src/storage/r2-fake.js';

import { AppError } from '../../src/errors.js';

/**
 * Almacén en memoria para las pruebas (`plan-ciclo-4g-direct-upload` §8).
 *
 * El humo y las pruebas de frontera no escriben en disco: un mapa con los bytes y su tipo alcanza
 * para demostrar que el objeto existe, que se copia y que se borra. Las firmas usan la **misma**
 * concesión que el doble `fake` del producto, así que una prueba puede recorrer el camino real del
 * navegador —ticket, subida por token, adjunción— sin tocar el sistema de archivos ni R2.
 *
 * La base pública es propia del doble, como en `r2-fake`: ninguna corrida depende del bucket.
 */
export function createMemoryObjectStore(): ObjectStore {
  const objects = new Map<string, { readonly bytes: Buffer; readonly contentType: string }>();

  return {
    put: (key, bytes, contentType) => {
      objects.set(key, { bytes, contentType });
      return Promise.resolve();
    },

    get: (key) => Promise.resolve(objects.get(key) ?? null),

    publicUrl: (key) => `https://fake.r2.local/${key}`,

    presignPut: (key, contentType, expiresInSeconds) =>
      Promise.resolve(grantFakeUpload(key, contentType, expiresInSeconds)),

    head: (key) => {
      const object = objects.get(key);
      return Promise.resolve(
        object === undefined
          ? null
          : { contentType: object.contentType, byteSize: object.bytes.length },
      );
    },

    copy: (from, to) => {
      const object = objects.get(from);
      if (object === undefined) {
        return Promise.reject(new AppError('internal_error'));
      }

      objects.set(to, object);
      return Promise.resolve();
    },

    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}
