import { ITEM_LIMITS } from '@mudanzapp/shared';

import { createGeminiDraftProvider } from '../../src/ai/gemini-draft.js';

/**
 * El adaptador `live` sin red (`plan-ciclo-3d` §8): `fetch` se inyecta, así que lo que se prueba es la
 * forma de la petición —modelo, cabecera, `file_data.file_uri`— y el mapeo de errores. El gate no
 * tiene credenciales y no las necesita: la descarga real de la URL es el hecho `live` del cierre.
 */
const MODEL = 'modelo-de-prueba';
const API_KEY = 'clave-de-prueba';
const IMAGE_URL = 'https://pub-test.r2.dev/event/item/photo-medium';

interface FetchCall {
  readonly url: string;
  readonly init: RequestInit;
}

function jsonResponse(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(payload), { status }));
}

/** Respuesta con la forma de la API: el texto del primer candidato. */
function candidate(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function providerWith(
  respond: () => Promise<Response>,
  calls: FetchCall[] = [],
): ReturnType<typeof createGeminiDraftProvider> {
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  };

  return createGeminiDraftProvider({
    model: MODEL,
    apiKey: API_KEY,
    fetch: fetchImpl as unknown as typeof fetch,
  });
}

/** El cuerpo JSON que el adaptador envía, ya deserializado. */
function sentBody(call: FetchCall): {
  contents: { parts: Record<string, unknown>[] }[];
  generationConfig: Record<string, unknown>;
} {
  return JSON.parse(String(call.init.body)) as {
    contents: { parts: Record<string, unknown>[] }[];
    generationConfig: Record<string, unknown>;
  };
}

const DRAFT = { title: 'Refrigerador', note: 'Refrigerador de dos puertas con imanes.' };

describe('gemini draft provider', () => {
  it('asks the configured model, not a hardcoded id', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' });

    expect(calls[0]?.url).toContain(`/models/${MODEL}:generateContent`);
    expect(calls[0]?.url).not.toContain('gemini-');
  });

  it('sends the API key in the x-goog-api-key header', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' });

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(API_KEY);
  });

  it('carries the photo as file_data.file_uri and never as inline_data', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' });

    const [first] = sentBody(calls[0] as FetchCall).contents;
    const filePart = first?.parts.find((part) => 'file_data' in part);
    expect(filePart?.file_data).toEqual({ mime_type: 'image/webp', file_uri: IMAGE_URL });
    expect(first?.parts.some((part) => 'inline_data' in part)).toBe(false);
  });

  it('asks for JSON and bounds the output tokens', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' });

    const config = sentBody(calls[0] as FetchCall).generationConfig;
    expect(config['responseMimeType']).toBe('application/json');
    expect(config['responseSchema']).toMatchObject({ required: ['title', 'note'] });
    expect(config['maxOutputTokens']).toBeGreaterThan(0);
    expect(config['maxOutputTokens']).toBeLessThanOrEqual(4_096);
  });

  it('returns the validated draft', async () => {
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))));

    await expect(provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' })).resolves.toEqual(
      DRAFT,
    );
  });

  it('maps a provider error status into ai_unavailable', async () => {
    const provider = providerWith(() => jsonResponse({ error: 'nope' }, 500));

    await expect(
      provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'ai_unavailable' });
  });

  it('maps a timeout or an abort into ai_unavailable', async () => {
    const provider = providerWith(() => Promise.reject(new Error('The operation was aborted')));

    await expect(
      provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'ai_unavailable' });
  });

  it('rejects text that is not JSON', async () => {
    const provider = providerWith(() => jsonResponse(candidate('Aquí tienes tu ficha:')));

    await expect(
      provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });

  it('rejects a JSON with an unknown key instead of repairing it', async () => {
    const provider = providerWith(() =>
      jsonResponse(candidate(JSON.stringify({ ...DRAFT, price: 100 }))),
    );

    await expect(
      provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });

  it('rejects a title longer than the contract', async () => {
    const provider = providerWith(() =>
      jsonResponse(
        candidate(JSON.stringify({ ...DRAFT, title: 'a'.repeat(ITEM_LIMITS.title + 1) })),
      ),
    );

    await expect(
      provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });

  it('rejects a blocked response as an invalid output', async () => {
    const provider = providerWith(() =>
      jsonResponse({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }),
    );

    await expect(
      provider.draft({ imageUrl: IMAGE_URL, mimeType: 'image/webp' }),
    ).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });
});
