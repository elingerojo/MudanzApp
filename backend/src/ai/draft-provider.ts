import type { AiDraft, ItemPhotoVariantContentType } from '@mudanzapp/shared';

import type { AiConfig } from '../config.js';
import { AppError, type ErrorCode } from '../errors.js';
import { createFakeDraftProvider } from './gemini-fake.js';
import { createGeminiDraftProvider } from './gemini-draft.js';

/**
 * Costura del borrador (`AI_MODE`) — `ai-draft`, ciclo 3d; multifoto desde 3i.
 *
 * Una interfaz, dos adaptadores y una fábrica por modo, con la misma forma que
 * [`object-store.ts`](../storage/object-store.ts:59) y [`oauth.ts`](../identity/oauth.ts:19). El
 * router no conoce al proveedor, no compone prompts y no lee `process.env`.
 *
 * La entrada son **las fotos** de la captura, en su orden: una o dos en la práctica, con el tope duro
 * del contrato como techo (`plan-ciclo-3i` §4). El cuerpo no es base64 en el borde: el navegador
 * envía los bytes que ya codificó, el router los decodifica del bundle y el adaptador `live` los
 * convierte a base64 dentro de su propia llamada. El almacén no participa en el borrador.
 *
 * Los fallos lanzan `AppError` con los códigos del catálogo del borde: `ai_mode_invalid`,
 * `ai_not_configured`, `ai_unavailable` y `ai_output_invalid`.
 */

/**
 * Una foto de la petición: los bytes del codificador del dispositivo y su tipo real. Sin URL y sin
 * clave de almacén; el `base64` que el protocolo del proveedor exige nace y muere dentro del
 * adaptador `live`.
 */
export interface DraftPhoto {
  readonly bytes: Buffer;
  readonly contentType: ItemPhotoVariantContentType;
}

/**
 * El conjunto a describir. **El índice es el orden** de la captura: no hay `position`, porque un
 * segundo campo que dice lo mismo que el arreglo sería una fuente duplicada (`plan-ciclo-3e` §4).
 */
export interface DraftRequest {
  readonly photos: readonly DraftPhoto[];
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
