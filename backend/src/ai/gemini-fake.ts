import type { AiDraft } from '@mudanzapp/shared';
import { createHash } from 'node:crypto';

import type { AiDraftProvider, DraftRequest } from './draft-provider.js';

/**
 * Doble determinista del borrador (`AI_MODE=fake`).
 *
 * No lee las imágenes, no abre red y no consulta el reloj: el borrador es función del **bundle
 * completo** —cuántas fotos llegaron y qué bytes trajo cada una—, así que dos fotos producen un
 * borrador distinto del de una y la evidencia del e2e demuestra que el conjunto llegó entero, no que
 * el modelo leyó una sola parte (`plan-ciclo-3i` §4 y §7).
 *
 * Sustituirlo no cambia ninguna prueba de la suite: la calidad del borrador es un hecho del
 * proveedor, no del doble (`plan-ciclo-3d` §3).
 */

/** Hash estable del conjunto enviado: encadenado en el orden recibido, con el tipo de cada parte. */
function digestOf(request: DraftRequest): string {
  const hash = createHash('sha256');
  for (const photo of request.photos) {
    hash.update(photo.contentType);
    hash.update(photo.bytes);
  }

  return hash.digest('hex').slice(0, 8);
}

function fakeDraftFor(request: DraftRequest): AiDraft {
  const photos = request.photos.length;
  const label = photos === 1 ? '1 foto' : `${String(photos)} fotos`;
  const digest = digestOf(request);

  return {
    title: `Artículo de prueba (${label} ${digest})`,
    note: `Borrador de prueba con ${label}: la calidad es un hecho del proveedor y el conjunto enviado se identifica como ${digest}.`,
  };
}

export function createFakeDraftProvider(): AiDraftProvider {
  return {
    draft: (request: DraftRequest): Promise<AiDraft> => Promise.resolve(fakeDraftFor(request)),
  };
}
