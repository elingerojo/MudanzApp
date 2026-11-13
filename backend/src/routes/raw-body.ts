import { ITEM_LIMITS } from '@mudanzapp/shared';
import type { Request } from 'express';

import { AppError } from '../errors.js';

/**
 * Lector del cuerpo binario crudo, compartido por las subidas de foto y por el borrador de la IA
 * (`plan-ciclo-3d` §8; tope por parámetro desde `plan-ciclo-3i` §4).
 *
 * Vive aparte desde el ciclo 3d porque hay **varias** rutas que reciben binario como cuerpo y tienen
 * que juzgarlo con el mismo criterio: la subida de una variante y la petición del borrador —que desde
 * 3i lleva un bundle acotado de fotos, no una imagen—. Duplicar el lector sería duplicar la regla.
 *
 * El tope llega por parámetro porque es del **cuerpo que cada ruta espera**, no del lector: una
 * variante tiene el suyo y el bundle tiene el de su contrato. El default conserva a los llamadores
 * de una sola foto.
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
 * Lee el cuerpo binario con el tope de la ruta que lo llama. No se usa un parser de Express porque su
 * rechazo por tamaño se convertiría en un 500 del manejador genérico; aquí el exceso es
 * `photo_invalid`, que es lo que el cliente sabe interpretar (`05` §2).
 *
 * El tope es **cordura de transporte**, no una regla de peso de la imagen: una variante optimizada
 * nunca se acerca a 5 MiB y una foto pesada entra igual si el codificador no la bajó del objetivo
 * (`plan-ciclo-3c-optimizar` §5).
 */
export async function readPhotoBody(
  request: Request,
  limitBytes: number = ITEM_LIMITS.photoBytes,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.length;
    if (total > limitBytes) {
      throw new AppError('photo_invalid');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}
