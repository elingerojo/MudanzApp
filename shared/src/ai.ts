import { z } from 'zod';

import { ITEM_LIMITS } from './item.js';

/**
 * Contrato del borrador de la IA (`ai-draft`, ciclo 3d).
 *
 * El borrador **no** es estado: no tiene tabla, no tiene historial y no se persiste. Este archivo
 * publica solo la **forma de la salida de la integración**, que es lo que el humano revisa
 * (`resumen-funcional` §3 y §4; `decisiones` §34).
 *
 * No hay `model`, ni identificadores internos, ni la foto, ni la URL: el contrato no publica la
 * tubería. Lo único que viaja es lo que el humano puede corregir.
 */

/**
 * Límites del borrador, **derivados** de [`ITEM_LIMITS`](item.ts:27): el borrador solo puede llenar
 * campos que el artículo admite, así que hay una sola fuente para el número.
 */
export const AI_DRAFT_LIMITS = {
  title: ITEM_LIMITS.title,
  note: ITEM_LIMITS.note,
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
