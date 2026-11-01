import { ITEM_LIMITS } from '@mudanzapp/shared';

import { createGeminiDraftProvider } from '../../src/ai/gemini-draft.js';

/**
 * El adaptador `live` sin red (`plan-ciclo-3d` §9): `fetch` se inyecta, así que lo que se prueba es la
 * forma de la petición —modelo, cabecera y `inline_data` con los bytes de la variante— y el mapeo de
 * errores. El gate no tiene credenciales y no las necesita: la llamada real es el cierre manual.
 */
const MODEL = 'modelo-de-prueba';
const API_KEY = 'clave-de-prueba';

/** Los bytes que el navegador enviaría: la salida del codificador, sin ninguna conversión previa. */
const BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x0a, 0x00, 0xff, 0x7f]);

const REQUEST = { bytes: BYTES, contentType: 'image/webp' } as const;

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

    await provider.draft(REQUEST);

    expect(calls[0]?.url).toContain(`/models/${MODEL}:generateContent`);
    expect(calls[0]?.url).not.toContain('gemini-');
  });

  it('sends the API key in the x-goog-api-key header', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft(REQUEST);

    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(API_KEY);
  });

  it('carries the photo bytes as inline_data and never as a file uri', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft(REQUEST);

    const [first] = sentBody(calls[0] as FetchCall).contents;
    const inlinePart = first?.parts.find((part) => 'inline_data' in part);
    expect(inlinePart?.inline_data).toEqual({
      mime_type: 'image/webp',
      data: BYTES.toString('base64'),
    });
    expect(first?.parts.some((part) => 'file_data' in part)).toBe(false);
  });

  it('sends exactly the bytes it received, without re-encoding them', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft(REQUEST);

    const [first] = sentBody(calls[0] as FetchCall).contents;
    const part = first?.parts.find((candidate) => 'inline_data' in candidate) as
      { inline_data: { data: string } } | undefined;

    expect(Buffer.from(part?.inline_data.data ?? '', 'base64').equals(BYTES)).toBe(true);
    expect(BYTES.length).toBe(8);
  });

  it('asks for JSON and bounds the output tokens', async () => {
    const calls: FetchCall[] = [];
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))), calls);

    await provider.draft(REQUEST);

    const config = sentBody(calls[0] as FetchCall).generationConfig;
    expect(config['responseMimeType']).toBe('application/json');
    expect(config['responseSchema']).toMatchObject({ required: ['title', 'note'] });
    expect(config['maxOutputTokens']).toBeGreaterThan(0);
    expect(config['maxOutputTokens']).toBeLessThanOrEqual(4_096);
  });

  it('returns the validated draft', async () => {
    const provider = providerWith(() => jsonResponse(candidate(JSON.stringify(DRAFT))));

    await expect(provider.draft(REQUEST)).resolves.toEqual(DRAFT);
  });

  it('maps a provider error status into ai_unavailable', async () => {
    const provider = providerWith(() => jsonResponse({ error: 'nope' }, 500));

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_unavailable' });
  });

  it('maps a timeout or an abort into ai_unavailable', async () => {
    const provider = providerWith(() => Promise.reject(new Error('The operation was aborted')));

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_unavailable' });
  });

  it('rejects text that is not JSON', async () => {
    const provider = providerWith(() => jsonResponse(candidate('Aquí tienes tu ficha:')));

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });

  it('rejects a JSON with an unknown key instead of repairing it', async () => {
    const provider = providerWith(() =>
      jsonResponse(candidate(JSON.stringify({ ...DRAFT, price: 100 }))),
    );

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });

  it('rejects a title longer than the contract', async () => {
    const provider = providerWith(() =>
      jsonResponse(
        candidate(JSON.stringify({ ...DRAFT, title: 'a'.repeat(ITEM_LIMITS.title + 1) })),
      ),
    );

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });

  it('rejects a blocked response as an invalid output', async () => {
    const provider = providerWith(() =>
      jsonResponse({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }),
    );

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_output_invalid' });
  });
});
