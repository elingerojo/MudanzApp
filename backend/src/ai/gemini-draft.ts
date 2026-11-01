import { aiDraftSchema, type AiDraft } from '@mudanzapp/shared';

import { AppError } from '../errors.js';
import type { AiDraftProvider, DraftRequest } from './draft-provider.js';
import { DRAFT_INSTRUCTION } from './prompt.js';

/**
 * Adaptador `live` del borrador: Google Gemini por su API REST (ciclo 3d, decisión §34).
 *
 * La foto viaja como `file_data.file_uri` con la **dirección pública** de la variante ya guardada, y
 * el proveedor la descarga. El backend no reenvía bytes y no guarda nada: la foto no se mueve de
 * donde 3a y 3c-optimizar la dejaron.
 *
 * Hechos que fija el adaptador y **no** una variable de entorno:
 * - el host y la versión (`v1beta`) son del proveedor;
 * - `AI_MODEL` llega por configuración y nunca se cablea aquí;
 * - la clave va en `x-goog-api-key` y no se imprime, ni se registra, ni se transporta.
 *
 * Una sola tentativa y sin reintento automático: un `429` o un corte de red deja al humano
 * escribiendo a mano, que es la degradación elegida (§11). Nada del cuerpo, del prompt, de la clave,
 * de la URL ni de la respuesta se escribe en logs.
 */

const GEMINI_HOST = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_OUTPUT_TOKENS = 2_048;
const TIMEOUT_MS = 20_000;

/**
 * Esquema que el proveedor debe respetar. Se repite la forma de `aiDraftSchema` porque el protocolo
 * pide el esquema en su propio vocabulario; el contrato sigue siendo el de `zod`, que valida la
 * respuesta al volver.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    note: { type: 'STRING' },
  },
  required: ['title', 'note'],
  propertyOrdering: ['title', 'note'],
} as const;

export interface GeminiDraftOptions {
  readonly model: string;
  readonly apiKey: string;
  /** Inyectado para probar el mapeo de errores y la forma de la petición sin red. */
  readonly fetch: typeof fetch;
}

/** El texto del primer candidato; `null` cuando el proveedor lo bloqueó o no lo devolvió. */
function readCandidateText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const { promptFeedback, candidates } = payload as {
    promptFeedback?: { blockReason?: unknown };
    candidates?: readonly {
      content?: { parts?: readonly { text?: unknown }[] };
    }[];
  };

  // Una respuesta bloqueada no es un dato a medias: es una salida que no cumple el contrato.
  if (typeof promptFeedback?.blockReason === 'string') {
    return null;
  }

  const parts = candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  return text.length === 0 ? null : text;
}

export function createGeminiDraftProvider({
  model,
  apiKey,
  fetch: fetchImpl,
}: GeminiDraftOptions): AiDraftProvider {
  return {
    async draft(request: DraftRequest): Promise<AiDraft> {
      const url = `${GEMINI_HOST}/models/${encodeURIComponent(model)}:generateContent`;

      const body = {
        contents: [
          {
            role: 'user',
            parts: [
              { file_data: { mime_type: request.mimeType, file_uri: request.imageUrl } },
              { text: DRAFT_INSTRUCTION },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
        },
      };

      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        // Red caída o tiempo agotado: no hubo respuesta del proveedor.
        throw new AppError('ai_unavailable');
      }

      if (!response.ok) {
        throw new AppError('ai_unavailable');
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AppError('ai_output_invalid');
      }

      const text = readCandidateText(payload);
      if (text === null) {
        throw new AppError('ai_output_invalid');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new AppError('ai_output_invalid');
      }

      const draft = aiDraftSchema.safeParse(parsed);
      if (!draft.success) {
        throw new AppError('ai_output_invalid');
      }

      return draft.data;
    },
  };
}
