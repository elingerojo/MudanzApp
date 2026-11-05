import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { AppError } from '../errors.js';
import type { ObjectHead, ObjectStore, StoredObject } from './object-store.js';

/**
 * Doble determinista del almacén de objetos para `R2_MODE=fake`.
 *
 * Guarda en `os.tmpdir()/mudanzapp-fake-objects`, fuera del repo y sin secretos. Se eligió el
 * sistema de archivos y no un mapa en memoria porque una foto capturada debe seguir leyéndose tras
 * un reinicio del backend durante una prueba manual; lo que **no** es, y así se declara, es durable
 * ni compartido entre máquinas.
 *
 * El tipo de contenido se guarda en un archivo hermano con sufijo: el adaptador real devuelve ambas
 * cosas en la misma respuesta, y el doble debe ofrecer la misma forma.
 *
 * Desde el ciclo 4g también firma escrituras: en vez de una URL de R2, devuelve una **relativa al
 * API** con un token de un solo origen, que la ruta `PUT /__fake-r2/put` canjea por una escritura. El
 * navegador recorre el mismo camino que en `live` —pide el ticket, sube por su cuenta— sin que
 * ninguna prueba dependa del bucket real.
 */

const ROOT = join(tmpdir(), 'mudanzapp-fake-objects');
const CONTENT_TYPE_SUFFIX = '.content-type';

/**
 * Base pública del doble. Es **fija** a propósito: no se lee `R2_PUBLIC_BASE_URL`, así que un
 * `.env.local` con la base real no altera lo que ve la prueba. La URL es determinista, pero no
 * descargable: el píxel es un hecho `live`, no de gate (`plan-ciclo-3c` §7).
 */
const PUBLIC_BASE_URL = 'https://fake.r2.local';

/** Ruta del borde que canjea un token por una escritura; el cliente la resuelve contra el API. */
export const FAKE_UPLOAD_PATH = '/__fake-r2/put';

interface UploadGrant {
  readonly key: string;
  readonly contentType: string;
  readonly expiresAt: number;
}

/**
 * Tokens de escritura del doble. Es un mapa del proceso a propósito: el `fake` corre en una sola
 * instancia y una prueba levanta un solo backend, así que compartir el estado entre el router que
 * firma y la ruta que recibe los bytes no necesita nada más.
 */
const UPLOAD_GRANTS = new Map<string, UploadGrant>();

/** Descarta las concesiones caducadas; se llama al emitir una nueva. */
function pruneGrants(): void {
  for (const [token, grant] of UPLOAD_GRANTS) {
    if (grant.expiresAt <= Date.now()) {
      UPLOAD_GRANTS.delete(token);
    }
  }
}

/**
 * Emite una concesión de escritura y devuelve la URL que la canjea.
 *
 * Vive fuera de `createFileObjectStore` porque el doble en memoria de las pruebas de frontera también
 * necesita conceder escrituras: la ruta `PUT /__fake-r2/put` valida contra el mismo mapa, y así una
 * prueba de router ejercita el camino real del navegador sin tocar el sistema de archivos.
 */
export function grantFakeUpload(
  key: string,
  contentType: string,
  expiresInSeconds: number,
): string {
  pruneGrants();

  const token = randomUUID();
  UPLOAD_GRANTS.set(token, {
    key,
    contentType,
    expiresAt: Date.now() + expiresInSeconds * 1_000,
  });

  return `${FAKE_UPLOAD_PATH}?token=${token}`;
}

/**
 * Canjea un token por la escritura que autoriza, o `null` si no existe o caducó.
 *
 * La ruta `PUT /__fake-r2/put` se monta siempre y responde `404` cuando no hay concesión: en `live`
 * no hay tokens, así que la ruta no hace nada y no revela que existe.
 */
export function consumeFakeUploadGrant(token: string): { key: string; contentType: string } | null {
  const grant = UPLOAD_GRANTS.get(token);
  if (grant === undefined) {
    return null;
  }

  if (grant.expiresAt <= Date.now()) {
    UPLOAD_GRANTS.delete(token);
    return null;
  }

  return { key: grant.key, contentType: grant.contentType };
}

/**
 * Una clave la genera el backend (`newObjectKey`), no el cliente. Aun así se rechaza cualquier forma
 * que pueda escapar del directorio raíz: el doble no es el lugar donde descubrir un recorrido de
 * rutas.
 */
function targetPath(root: string, key: string): string | null {
  const unsafe =
    key.length === 0 ||
    key.includes('..') ||
    key.startsWith('/') ||
    key.startsWith('\\') ||
    key.includes('\\');
  return unsafe ? null : join(root, key);
}

/**
 * `root` es inyectable para que una prueba use un directorio temporal propio y no comparta estado
 * con una captura manual. El `ROOT` del módulo es el default del producto.
 */
export function createFileObjectStore(root: string = ROOT): ObjectStore {
  const resolve = (key: string): string | null => targetPath(root, key);

  const read = async (key: string): Promise<StoredObject | null> => {
    const path = resolve(key);
    if (path === null) {
      return null;
    }

    try {
      const [bytes, contentType] = await Promise.all([
        readFile(path),
        readFile(`${path}${CONTENT_TYPE_SUFFIX}`, 'utf8'),
      ]);
      return { bytes, contentType: contentType.trim() };
    } catch {
      // Un objeto ausente y un temporal limpiado se leen igual: no hay foto.
      return null;
    }
  };

  const write = async (key: string, bytes: Buffer, contentType: string): Promise<void> => {
    const path = resolve(key);
    if (path === null) {
      throw new AppError('internal_error');
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    await writeFile(`${path}${CONTENT_TYPE_SUFFIX}`, contentType, 'utf8');
  };

  return {
    put: write,

    get: read,

    // Misma composición que el adaptador `live`, con la base propia del doble.
    publicUrl(key: string): string {
      return `${PUBLIC_BASE_URL}/${key.replace(/^\/+/, '')}`;
    },

    async presignPut(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
      if (resolve(key) === null) {
        throw new AppError('internal_error');
      }

      return grantFakeUpload(key, contentType, expiresInSeconds);
    },

    async head(key: string): Promise<ObjectHead | null> {
      const path = resolve(key);
      if (path === null) {
        return null;
      }

      try {
        const [metadata, contentType] = await Promise.all([
          stat(path),
          readFile(`${path}${CONTENT_TYPE_SUFFIX}`, 'utf8'),
        ]);
        return { contentType: contentType.trim(), byteSize: metadata.size };
      } catch {
        return null;
      }
    },

    async copy(from: string, to: string): Promise<void> {
      const source = await read(from);
      if (source === null) {
        throw new AppError('internal_error');
      }

      await write(to, source.bytes, source.contentType);
    },

    async delete(key: string): Promise<void> {
      const path = resolve(key);
      if (path === null) {
        return;
      }

      for (const target of [path, `${path}${CONTENT_TYPE_SUFFIX}`]) {
        try {
          await unlink(target);
        } catch {
          // Borrar lo que no está no es un error: el contrato es idempotente.
        }
      }
    },
  };
}
