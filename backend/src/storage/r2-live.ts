import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';

import { AppError } from '../errors.js';
import type { ObjectStore, StoredObject } from './object-store.js';

/**
 * Adaptador `live` del almacén de objetos (ciclo 3c, `publish`).
 *
 * El cliente S3 se construye con la forma de los ejemplos oficiales: `region: 'auto'` —lo exige el
 * SDK y R2 no lo usa— y el bucket viaja en el `Bucket:` de cada comando, no en el host. No se fija
 * `forcePathStyle`: no es un requisito de R2 ni de su documentación.
 *
 * El cliente se **inyecta** en `createR2ObjectStore`, que es la costura que permite probar el mapeo
 * de errores sin red: el gate no tiene credenciales y no las necesita.
 *
 * Solo tres operaciones: escribir, leer y resolver la URL pública. No hay prefirma, ni listado, ni
 * borrado; no están en el alcance del ciclo, y los objetos huérfanos se barren a mano (§10).
 */

/** Las tres piezas con las que se habla la API compatible con S3 del bucket. */
export interface R2EndpointCredentials {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export function createS3Client(credentials: R2EndpointCredentials): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: credentials.endpoint,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
}

export interface R2ObjectStoreOptions {
  readonly client: Pick<S3Client, 'send'>;
  readonly bucket: string;
  readonly publicBaseUrl: string;
}

/**
 * Un objeto ausente se reconoce por su clase, por su nombre o por el 404 de la respuesta: el SDK
 * cambia de forma entre versiones y el contrato del adaptador no depende de cuál llegue.
 */
function isMissingObject(error: unknown): boolean {
  if (error instanceof NoSuchKey) {
    return true;
  }

  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ((error as { name?: unknown }).name === 'NoSuchKey') {
    return true;
  }

  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
  return metadata?.httpStatusCode === 404;
}

/** Sin barra final en la base ni barra inicial en la clave: una sola barra entre ambas. */
function publicUrlOf(publicBaseUrl: string, key: string): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}

export function createR2ObjectStore({
  client,
  bucket,
  publicBaseUrl,
}: R2ObjectStoreOptions): ObjectStore {
  return {
    async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            ContentType: contentType,
          }),
        );
      } catch {
        // Una escritura fallida no deja fila: la ruta escribe el objeto antes que su registro.
        throw new AppError('r2_unavailable');
      }
    },

    async get(key: string): Promise<StoredObject | null> {
      let result: GetObjectCommandOutput;
      try {
        result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      } catch (error: unknown) {
        if (isMissingObject(error)) {
          return null;
        }

        throw new AppError('r2_unavailable');
      }

      if (result.Body === undefined) {
        return null;
      }

      const bytes = Buffer.from(await result.Body.transformToByteArray());
      return { bytes, contentType: result.ContentType ?? 'application/octet-stream' };
    },

    // Sin firmar: es la base pública del bucket, no una URL temporal.
    publicUrl(key: string): string {
      return publicUrlOf(publicBaseUrl, key);
    },
  };
}
