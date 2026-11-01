import type { AiDraft } from '@mudanzapp/shared';

import type { AiDraftProvider } from './draft-provider.js';

/**
 * Doble determinista del borrador (`AI_MODE=fake`).
 *
 * No lee la imagen, no abre red y no consulta el reloj: devuelve siempre el mismo borrador, así que
 * la evidencia del gate demuestra contrato, validación, prefill y revisión humana, **no** la calidad
 * del borrador (`plan-ciclo-3d` §3). Sustituirlo no cambia ninguna prueba de la suite.
 */
const FIXED_DRAFT: AiDraft = {
  title: 'Artículo sin identificar',
  note: 'Borrador de prueba: la calidad del borrador es un hecho del proveedor, no del doble.',
};

export function createFakeDraftProvider(): AiDraftProvider {
  return {
    // No mira la petición a propósito: el doble no lee la imagen ni la URL.
    draft: () => Promise.resolve(FIXED_DRAFT),
  };
}
