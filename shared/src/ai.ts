import { z } from 'zod';

import { CAPTURE_LIMITS } from './capture.js';
import { ITEM_LIMITS } from './item.js';

/**
 * Contrato del borrador de la IA (`ai-draft`, ciclo 3d; multifoto desde el corte 3i).
 *
 * El borrador **no** es estado: no tiene tabla, no tiene historial y no se persiste. Este archivo
 * publica solo la **forma de la salida de la integración**, que es lo que el humano revisa
 * (`resumen-funcional` §3 y §4; `decisiones` §34).
 *
 * El cuerpo de la petición tampoco es una imagen única desde 3i: es un **bundle acotado** de una o
 * varias fotos en el orden de la captura, con su framing en [`photo-bundle`](photo-bundle.ts:1). El
 * número de fotos lo decide la captura —`photosForLevel` en [`onboarding`](onboarding.ts:94)—; la
 * frontera solo aplica el tope duro.
 *
 * No hay `model`, ni identificadores internos, ni la foto, ni la URL: el contrato no publica la
 * tubería. Lo único que viaja es lo que el humano puede corregir.
 */

/**
 * Límites del borrador, **derivados** de [`ITEM_LIMITS`](item.ts:27) y de
 * [`CAPTURE_LIMITS`](capture.ts:33): el borrador solo puede llenar campos que el artículo admite y
 * no puede leer más fotos que las que la galería guarda, así que hay una sola fuente por cada número.
 */
export const AI_DRAFT_LIMITS = {
  title: ITEM_LIMITS.title,
  note: ITEM_LIMITS.note,
  /**
   * Tope **duro** de fotos por borrador. No es el del nivel de onboarding: ese lo decide la captura y
   * el borde no lo conoce (`plan-ciclo-3i` §0).
   */
  photos: CAPTURE_LIMITS.photos,
  /**
   * Tope de transporte del cuerpo completo —cabecera y blobs—: 1 MiB por foto. Es cordura de
   * transporte, no una regla de peso de la imagen: la mediana objetivo pesa mucho menos.
   */
  bundleBytes: CAPTURE_LIMITS.photos * 1024 * 1024,
} as const;

/**
 * Validación de la **salida de la integración** (`02` §3), no del formulario.
 *
 * `strictObject`: una clave de más es un fallo, no un dato a medias. No se «repara» la salida: un
 * JSON envuelto en un bloque de código falla ruidosamente en vez de adivinar qué quiso decir el
 * modelo. Sin `note` opcional: un borrador sin nota no sirve para revisar.
 */
export const aiDraftSchema = z.strictObject({
  title: z.string().trim().min(1).max(AI_DRAFT_LIMITS.title),
  note: z.string().trim().min(1).max(AI_DRAFT_LIMITS.note),
});

export type AiDraft = z.infer<typeof aiDraftSchema>;

/** `POST /events/:eventId/items/:itemId/draft`: `200` con el borrador ya validado. */
export interface AiDraftResult {
  readonly draft: AiDraft;
}
