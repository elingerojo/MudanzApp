import { AI_DRAFT_LIMITS } from '@mudanzapp/shared';

import { createAiDraftProvider } from '../../src/ai/draft-provider.js';

/**
 * La fábrica por modo (`plan-ciclo-3d` §8): `fake` devuelve el doble determinista, un modo
 * desconocido es `ai_mode_invalid` y un `live` incompleto es `ai_not_configured`. Los tres fallan en
 * la primera petición, con código estable y sin fingir un borrador.
 */
const noFetch = (): Promise<Response> =>
  Promise.reject(new Error('the fake must not use the network'));

/** La petición es la variante ya codificada: bytes y su tipo, sin URL y sin almacén. */
const REQUEST = {
  bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]),
  contentType: 'image/webp',
} as const;

describe('createAiDraftProvider', () => {
  it('returns a deterministic draft in fake mode and never calls the network', async () => {
    const provider = createAiDraftProvider(
      { mode: 'fake', model: null, apiKey: null },
      { fetch: noFetch as unknown as typeof fetch },
    );

    const draft = await provider.draft(REQUEST);

    expect(draft.title.length).toBeGreaterThan(0);
    expect(draft.title.length).toBeLessThanOrEqual(AI_DRAFT_LIMITS.title);
    expect(draft.note.length).toBeLessThanOrEqual(AI_DRAFT_LIMITS.note);
    await expect(provider.draft(REQUEST)).resolves.toEqual(draft);
  });

  it('rejects an unknown mode with ai_mode_invalid', async () => {
    const provider = createAiDraftProvider(
      { mode: 'sometimes', model: null, apiKey: null },
      { fetch: noFetch as unknown as typeof fetch },
    );

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_mode_invalid' });
  });

  it('rejects a live mode without a model with ai_not_configured', async () => {
    const provider = createAiDraftProvider(
      { mode: 'live', model: null, apiKey: 'clave' },
      { fetch: noFetch as unknown as typeof fetch },
    );

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_not_configured' });
  });

  it('rejects a live mode without a key with ai_not_configured', async () => {
    const provider = createAiDraftProvider(
      { mode: 'live', model: 'modelo', apiKey: null },
      { fetch: noFetch as unknown as typeof fetch },
    );

    await expect(provider.draft(REQUEST)).rejects.toMatchObject({ code: 'ai_not_configured' });
  });
});
