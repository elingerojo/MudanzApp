import {
  AI_DRAFT_LIMITS,
  PHOTO_BUNDLE_CONTENT_TYPE,
  encodePhotoBundle,
  type AiDraft,
} from '@mudanzapp/shared';

import type { AiDraftProvider, DraftRequest } from '../../src/ai/draft-provider.js';
import type { Database } from '../../src/db.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La frontera del borrador multifoto (corte 3i, `plan-ciclo-3i` §4 y §7).
 *
 * Lo que se demuestra aquí es **el borde**: el cuerpo se decodifica, cada foto llega a la costura en
 * el orden del sobre, y los rechazos distinguen una cabecera rota (`validation_failed`) de una foto
 * que no pasa el tope o el tipo (`photo_invalid`). La ruta sigue sin conocer artículo ni base: el
 * evento ajeno responde `not_found` y la credencial falta responde `unauthorized`, los dos **antes**
 * de leer el cuerpo.
 */
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EVENT_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'co-token';

const DRAFT: AiDraft = {
  title: 'Silla de madera',
  note: 'Silla con respaldo alto y patas torneadas.',
};

function rows<Row>(entries: Row[], rowCount = entries.length) {
  return Promise.resolve({ rows: entries, rowCount, command: 'SELECT', oid: 0, fields: [] });
}

/** Doble por forma de la sentencia: la sesión y su `touch`; todo lo demás falla. */
function sessionDatabase(): Database {
  return {
    check: () => Promise.resolve('ok'),
    transaction: () => Promise.reject(new Error('test-database-transaction-not-stubbed')),
    close: () => Promise.resolve(),
    query: (text: string) => {
      if (text.includes('s.token_hash = $1')) {
        return rows([
          {
            id: 'session-co',
            userId: null,
            eventId: EVENT_ID,
            scope: 'app',
            revokedAt: null,
            displayName: null,
            isAdmin: null,
          },
        ]);
      }

      if (text.includes('UPDATE app.session SET last_seen_at')) {
        return rows([], 0);
      }

      return Promise.reject(new Error(`test-database-query-not-stubbed: ${text}`));
    },
  } as unknown as Database;
}

/** Proveedor que registra lo que recibe y responde un borrador válido. */
function recordingProvider(): { provider: AiDraftProvider; requests: DraftRequest[] } {
  const requests: DraftRequest[] = [];

  return {
    requests,
    provider: {
      draft: (request: DraftRequest): Promise<AiDraft> => {
        requests.push(request);
        return Promise.resolve(DRAFT);
      },
    },
  };
}

function bearer(): Record<string, string> {
  return { Authorization: `Bearer ${TOKEN}` };
}

/** Un cuerpo a mano para los casos que el codificador no produce. */
function frame(header: unknown, blobs: readonly Uint8Array[]): Buffer {
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const body = Buffer.alloc(4 + headerBytes.length + blobs.reduce((sum, b) => sum + b.length, 0));
  body.writeUInt32BE(headerBytes.length, 0);
  headerBytes.copy(body, 4);

  let offset = 4 + headerBytes.length;
  for (const blob of blobs) {
    Buffer.from(blob).copy(body, offset);
    offset += blob.length;
  }

  return body;
}

async function start() {
  const recorder = recordingProvider();
  const app = await startTestApp('ok', '', {
    database: sessionDatabase(),
    ai: recorder.provider,
  });

  return { app, requests: recorder.requests };
}

function postDraft(
  baseUrl: string,
  eventId: string,
  body: Buffer | Uint8Array,
  contentType: string = PHOTO_BUNDLE_CONTENT_TYPE,
  headers: Record<string, string> = bearer(),
): Promise<Response> {
  return fetch(`${baseUrl}/events/${eventId}/ai/drafts`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType },
    body,
  });
}

describe('POST /events/:eventId/ai/drafts', () => {
  it('hands every photo of the bundle to the seam, in the order of the capture', async () => {
    const { app, requests } = await start();

    try {
      const first = Uint8Array.of(1, 2, 3);
      const second = Uint8Array.of(9, 8, 7);
      const bundle = encodePhotoBundle([
        { contentType: 'image/webp', bytes: first },
        { contentType: 'image/jpeg', bytes: second },
      ]);

      const response = await postDraft(app.baseUrl, EVENT_ID, bundle);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ draft: DRAFT });
      expect(requests).toHaveLength(1);
      expect(requests[0]?.photos.map((photo) => photo.contentType)).toEqual([
        'image/webp',
        'image/jpeg',
      ]);
      expect(requests[0]?.photos.map((photo) => Array.from(photo.bytes))).toEqual([
        [1, 2, 3],
        [9, 8, 7],
      ]);
    } finally {
      await app.close();
    }
  });

  it('answers validation_failed when the header is not a bundle', async () => {
    const { app, requests } = await start();

    try {
      const garbage = await postDraft(
        app.baseUrl,
        EVENT_ID,
        Buffer.from('no soy un sobre', 'utf8'),
      );
      expect(garbage.status).toBe(400);
      await expect(garbage.json()).resolves.toEqual({ error: 'validation_failed' });

      const truncated = await postDraft(
        app.baseUrl,
        EVENT_ID,
        frame({ photos: [] }, []).subarray(0, 3),
      );
      expect(truncated.status).toBe(400);
      await expect(truncated.json()).resolves.toEqual({ error: 'validation_failed' });

      // Nada de esto llegó a la costura: la frontera no paga una llamada al proveedor por un abuso.
      expect(requests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('answers photo_invalid for an empty list, a foreign type and a body over the cap', async () => {
    const { app, requests } = await start();

    try {
      const empty = await postDraft(app.baseUrl, EVENT_ID, frame({ photos: [] }, []));
      expect(empty.status).toBe(400);
      await expect(empty.json()).resolves.toEqual({ error: 'photo_invalid' });

      const foreignType = await postDraft(
        app.baseUrl,
        EVENT_ID,
        frame({ photos: [{ contentType: 'image/gif', byteLength: 3 }] }, [Uint8Array.of(1, 2, 3)]),
      );
      expect(foreignType.status).toBe(400);
      await expect(foreignType.json()).resolves.toEqual({ error: 'photo_invalid' });

      const tooBig = await postDraft(
        app.baseUrl,
        EVENT_ID,
        Buffer.alloc(AI_DRAFT_LIMITS.bundleBytes + 1),
      );
      expect(tooBig.status).toBe(400);
      await expect(tooBig.json()).resolves.toEqual({ error: 'photo_invalid' });

      expect(requests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('still refuses a body that is an image instead of the bundle', async () => {
    const { app, requests } = await start();

    try {
      const response = await postDraft(
        app.baseUrl,
        EVENT_ID,
        Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
        'image/jpeg',
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'photo_invalid' });
      expect(requests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it('does not distinguish a foreign event from a missing one and requires a session', async () => {
    const { app, requests } = await start();

    try {
      const bundle = encodePhotoBundle([
        { contentType: 'image/webp', bytes: Uint8Array.of(1, 2, 3) },
      ]);

      const anonymous = await postDraft(
        app.baseUrl,
        EVENT_ID,
        bundle,
        PHOTO_BUNDLE_CONTENT_TYPE,
        {},
      );
      expect(anonymous.status).toBe(401);
      await expect(anonymous.json()).resolves.toEqual({ error: 'unauthorized' });

      const foreign = await postDraft(app.baseUrl, OTHER_EVENT_ID, bundle);
      expect(foreign.status).toBe(404);
      await expect(foreign.json()).resolves.toEqual({ error: 'not_found' });

      expect(requests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
