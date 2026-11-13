import { AI_DRAFT_LIMITS } from '@mudanzapp/shared';

import { createAiDraftProvider } from '../../src/ai/draft-provider.js';

/**
 * La fábrica por modo (`plan-ciclo-3d` §8; multifoto desde 3i): `fake` devuelve el doble determinista
 * sobre el conjunto enviado, un modo desconocido es `ai_mode_invalid` y un `live` incompleto es
 * `ai_not_configured`. Los tres fallan en la primera petición, con código estable y sin fingir un
 * borrador.
 */
const noFetch = (): Promise<Response> =>
  Promise.reject(new Error('the fake must not use the network'));

/** La petición son las fotos ya codificadas: bytes y tipo de cada una, sin URL y sin almacén. */
const REQUEST = {
  photos: [{ bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]), contentType: 'image/webp' }],
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

  it('distinguishes two photos from one, so the e2e proves the whole bundle arrived', async () => {
    const provider = createAiDraftProvider(
      { mode: 'fake', model: null, apiKey: null },
      { fetch: noFetch as unknown as typeof fetch },
    );

    const [single] = REQUEST.photos;
    const one = await provider.draft({ photos: [single] });
    const two = await provider.draft({ photos: [single, single] });

    expect(two.title).not.toBe(one.title);
    expect(two.title).toContain('2 fotos');
    expect(one.title).toContain('1 foto');
    // El mismo conjunto produce el mismo borrador: el doble no depende del azar.
    await expect(provider.draft({ photos: [single, single] })).resolves.toEqual(two);
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
