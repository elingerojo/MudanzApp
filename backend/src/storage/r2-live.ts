import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppError } from '../errors.js';
import type { ObjectHead, ObjectStore, PresignPut, StoredObject } from './object-store.js';

/**
 * Adaptador `live` del almacén de objetos (ciclo 3c, `publish`; ampliado en 4g, `direct-upload`).
 *
 * El cliente S3 se construye con la forma de los ejemplos oficiales: `region: 'auto'` —lo exige el
 * SDK y R2 no lo usa— y el bucket viaja en el `Bucket:` de cada comando, no en el host. No se fija
 * `forcePathStyle`: no es un requisito de R2 ni de su documentación.
 *
 * El cliente se **inyecta** en `createR2ObjectStore`, que es la costura que permite probar el mapeo
 * de errores sin red: el gate no tiene credenciales y no las necesita. Lo mismo vale para el
 * firmador: `createR2Presigner` recibe el cliente y devuelve la función que firma, así que una prueba
 * sustituye la firma sin tocar el adaptador.
 *
 * Operaciones: escribir, leer, resolver la URL pública, prefirmar una escritura, leer metadatos,
 * copiar y borrar. **No hay listado**: el barrido de huérfanos (C1) lo necesita y entra con su corte,
 * no aquí.
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

/**
 * Firma una escritura para el navegador (`PutObject` prefirmado).
 *
 * El `ContentType` se firma con la URL: un cliente que mande otro tipo recibe `403` del almacén, y
 * por eso el ticket declara el tipo una sola vez. La expiración la decide quien llama: el ticket del
 * ciclo 4g pide `CAPTURE_LIMITS.ttlSeconds`.
 */
export function createR2Presigner(client: S3Client, bucket: string): PresignPut {
  return ({ key, contentType, expiresInSeconds }) =>
    getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
}

export interface R2ObjectStoreOptions {
  readonly client: Pick<S3Client, 'send'>;
  readonly bucket: string;
  readonly publicBaseUrl: string;
  /** Inyectado para no requerir el cliente completo en las pruebas. */
  readonly presign: PresignPut;
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

/**
 * `CopySource` se compone con el bucket delante y la clave codificada por segmento: S3 exige la
 * forma `bucket/clave` y no acepta barras ni signos sin codificar dentro del nombre.
 */
function copySourceOf(bucket: string, key: string): string {
  const encoded = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${bucket}/${encoded}`;
}

export function createR2ObjectStore({
  client,
  bucket,
  publicBaseUrl,
  presign,
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

    async presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
      try {
        return await presign({ key, contentType, expiresInSeconds });
      } catch {
        throw new AppError('r2_unavailable');
      }
    },

    async head(key: string): Promise<ObjectHead | null> {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return {
          contentType: result.ContentType ?? 'application/octet-stream',
          byteSize: result.ContentLength ?? 0,
        };
      } catch (error: unknown) {
        if (isMissingObject(error)) {
          return null;
        }

        throw new AppError('r2_unavailable');
      }
    },

    async copy(from: string, to: string): Promise<void> {
      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: to,
            CopySource: copySourceOf(bucket, from),
          }),
        );
      } catch {
        throw new AppError('r2_unavailable');
      }
    },

    async delete(key: string): Promise<void> {
      try {
        // S3 responde `204` aunque la clave no exista: borrar lo que no está no es un error.
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        throw new AppError('r2_unavailable');
      }
    },
  };
}
