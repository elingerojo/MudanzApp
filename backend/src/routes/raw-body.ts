import { ITEM_LIMITS } from '@mudanzapp/shared';
import type { Request } from 'express';

import { AppError } from '../errors.js';

/**
 * Lector del cuerpo binario crudo, compartido por las subidas de foto y por el borrador de la IA
 * (`plan-ciclo-3d` §8).
 *
 * Vive aparte desde el ciclo 3d porque ahora hay **dos** rutas que reciben una foto como cuerpo y
 * tienen que juzgarla con el mismo criterio y el mismo tope: la subida de una variante y la petición
 * del borrador. Duplicar el lector sería duplicar la regla.
 */

/**
 * El tipo declarado, sin parámetros: `image/jpeg; charset=…` y `IMAGE/JPEG` son el mismo tipo.
 * Se lee de la cabecera y no del parser porque aquí no hay parser: la foto llega como cuerpo crudo.
 */
export function declaredContentType(request: Request): string {
  const header = request.headers['content-type'] ?? '';
  const [first] = header.split(';');
  return (first ?? '').trim().toLowerCase();
}

/**
 * Lee el cuerpo binario con un tope propio. No se usa un parser de Express porque su rechazo por
 * tamaño se convertiría en un 500 del manejador genérico; aquí el exceso es `photo_invalid`, que es
 * lo que el cliente sabe interpretar (`05` §2).
 *
 * El tope es **cordura de transporte**, no una regla de peso de la imagen: una variante optimizada
 * nunca se acerca a 5 MiB y una foto pesada entra igual si el codificador no la bajó del objetivo
 * (`plan-ciclo-3c-optimizar` §5).
 */
export async function readPhotoBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > ITEM_LIMITS.photoBytes) {
      throw new AppError('photo_invalid');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
