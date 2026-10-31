import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { AppError } from '../errors.js';
import type { ObjectStore, StoredObject } from './object-store.js';

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
 */

const ROOT = join(tmpdir(), 'mudanzapp-fake-objects');
const CONTENT_TYPE_SUFFIX = '.content-type';

/**
 * Una clave la genera el backend (`newObjectKey`), no el cliente. Aun así se rechaza cualquier forma
 * que pueda escapar del directorio raíz: el doble no es el lugar donde descubrir un recorrido de
 * rutas.
 */
function targetPath(key: string): string | null {
  const unsafe =
    key.length === 0 ||
    key.includes('..') ||
    key.startsWith('/') ||
    key.startsWith('\\') ||
    key.includes('\\');
  return unsafe ? null : join(ROOT, key);
}

export function createFileObjectStore(root: string = ROOT): ObjectStore {
  const resolve = (key: string): string | null => {
    const path = targetPath(key);
    return path === null ? null : path.startsWith(root) ? path : null;
  };

  return {
    async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
      const path = resolve(key);
      if (path === null) {
        throw new AppError('internal_error');
      }

      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      await writeFile(`${path}${CONTENT_TYPE_SUFFIX}`, contentType, 'utf8');
    },

    async get(key: string): Promise<StoredObject | null> {
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
    },
  };
}
