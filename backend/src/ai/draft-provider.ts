import type { AiDraft, ItemPhotoVariantContentType } from '@mudanzapp/shared';

import type { AiConfig } from '../config.js';
import { AppError, type ErrorCode } from '../errors.js';
import { createFakeDraftProvider } from './gemini-fake.js';
import { createGeminiDraftProvider } from './gemini-draft.js';

/**
 * Costura del borrador (`AI_MODE`) — `ai-draft`, ciclo 3d.
 *
 * Una interfaz, dos adaptadores y una fábrica por modo, con la misma forma que
 * [`object-store.ts`](../storage/object-store.ts:59) y [`oauth.ts`](../identity/oauth.ts:19). El
 * router no conoce al proveedor, no compone prompts y no lee `process.env`.
 *
 * La entrada es **la dirección pública** de la variante ya guardada (forma A del plan §5): el
 * proveedor la descarga y el backend no reenvía bytes. Por eso el `DraftRequest` de este corte no
 * lleva un `Buffer`, y quien lo arma es el adaptador `live` a partir de la variante resuelta, nunca
 * el router.
 *
 * Los fallos lanzan `AppError` con los códigos del catálogo del borde: `ai_mode_invalid`,
 * `ai_not_configured`, `ai_unavailable` y `ai_output_invalid`.
 */

/** Lo que el adaptador recibe: la dirección pública de la foto y el tipo real del objeto. */
export interface DraftRequest {
  readonly imageUrl: string;
  readonly mimeType: ItemPhotoVariantContentType;
}

export interface AiDraftProvider {
  draft(request: DraftRequest): Promise<AiDraft>;
}

/** Proveedor que siempre rechaza con el código que explica por qué no hay borrador. */
function createUnavailable(
  code: Extract<ErrorCode, 'ai_mode_invalid' | 'ai_not_configured'>,
): AiDraftProvider {
  return {
    draft: () => Promise.reject(new AppError(code)),
  };
}

/**
 * Elige el adaptador por el modo declarado. Un modo desconocido es configuración inválida; un `live`
 * incompleto es una capacidad a la que le faltan piezas. Los dos fallan en la **primera petición**
 * con un código estable, en vez de fingir un borrador.
 */
export function createAiDraftProvider(
  config: AiConfig,
  dependencies: { readonly fetch: typeof fetch },
): AiDraftProvider {
  if (config.mode === 'fake') {
    return createFakeDraftProvider();
  }

  if (config.mode !== 'live') {
    return createUnavailable('ai_mode_invalid');
  }

  const { model, apiKey } = config;
  if (model === null || apiKey === null) {
    return createUnavailable('ai_not_configured');
  }

  return createGeminiDraftProvider({ model, apiKey, fetch: dependencies.fetch });
}
