import { randomUUID } from 'node:crypto';

import { captureObjectKey } from '@mudanzapp/shared';

import { createDatabase } from '../../src/db.js';
import { normalizeItemDraft } from '../../src/domain/item.js';
import { createEvent, createSession, ensureAdminUser } from '../../src/store/identity-store.js';
import { findItem, insertItem } from '../../src/store/item-store.js';
import { hashToken } from '../../src/tokens.js';
import { createMemoryObjectStore } from '../support/memory-object-store.js';
import { startTestApp } from '../support/test-app.js';

/**
 * La adjunción de una captura sobre la base real (ciclo 4g, `plan-ciclo-4g-direct-upload` §4.2).
 *
 * Lo que sólo la base puede demostrar es el efecto: las tres variantes se copian a su clave
 * definitiva y las filas existen; repetir la adjunción en la misma posición **reemplaza** y no
 * acumula; una captura a la que le falta una variante no escribe nada.
 *
 * El almacén es el doble en memoria: el gate no tiene credenciales de R2 y no las necesita
 * (`plan-ciclo-3c` §7). Solo entra con `test:api:db`/`:branch`, que derivan la URL de pruebas.
 */
const database = createDatabase(process.env.DATABASE_URL ?? null);

afterAll(async () => {
  await database.close();
});

/**
 * Credencial única por corrida: la base `_test` es un sandbox que se reaplica sin borrar filas, y un
 * token fijo choca con el hash de la corrida anterior (`session_token_hash_key`). La prueba no cambia:
 * lo que se ejerce es el efecto de la adjunción, no el valor de la credencial.
 */
const TOKEN = `attach-test-${randomUUID()}`;
const CONTENT_TYPE = 'image/webp';

const VARIANTS = [
  { variant: 'thumb' as const, widthPx: 320, heightPx: 240 },
  { variant: 'medium' as const, widthPx: 768, heightPx: 576 },
  { variant: 'large' as const, widthPx: 1_440, heightPx: 1_080 },
];

interface Seeded {
  readonly captureId: string;
  readonly keys: readonly string[];
}

/** Deja las tres variantes en el staging de una captura, como haría el navegador. */
async function seedCapture(
  storage: ReturnType<typeof createMemoryObjectStore>,
  eventId: string,
  contentType = CONTENT_TYPE,
): Promise<Seeded> {
  const captureId = randomUUID();
  const keys = VARIANTS.map((entry) => captureObjectKey(eventId, captureId, entry.variant));

  for (const key of keys) {
    await storage.put(key, Buffer.from(`bytes-${key}`), contentType);
  }

  return { captureId, keys };
}

function body(captureId: string) {
  return {
    captures: [{ captureId, slot: 0, variants: VARIANTS }],
  };
}

describe('POST /events/:eventId/items/:itemId/photos', () => {
  it('copies the three variants, writes the rows and clears the staging', async () => {
    const admin = await ensureAdminUser(database);
    expect(admin).not.toBeNull();
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Guayaquil',
      currency: 'MXN',
    });

    const item = await insertItem(database, {
      eventId: event.id,
      draft: normalizeItemDraft({ title: 'Mesa de roble' }),
    });

    await createSession(database, {
      userId: null,
      eventId: event.id,
      tokenHash: hashToken(TOKEN),
      scope: 'app',
      deviceLabel: 'prueba',
    });

    const storage = createMemoryObjectStore();
    const seeded = await seedCapture(storage, event.id);
    const app = await startTestApp('ok', '', { database, storage });

    try {
      const response = await fetch(`${app.baseUrl}/events/${event.id}/items/${item.id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body(seeded.captureId)),
      });

      expect(response.status).toBe(200);

      const payload = (await response.json()) as {
        photos: { id: string; sizes: Record<string, { widthPx: number } | null> }[];
      };

      expect(payload.photos).toHaveLength(1);
      expect(payload.photos[0]?.sizes['large']?.widthPx).toBe(1_440);
      expect(payload.photos[0]?.sizes['thumb']?.widthPx).toBe(320);

      // La galería del artículo ya contiene su foto en la posición 0: la adjunción escribió las
      // cuatro filas y la lectura ordenada las publica.
      const stored = await findItem(database, event.id, item.id);
      expect(stored?.photos).toHaveLength(1);
      expect(stored?.photos[0]?.id).toBe(payload.photos[0]?.id);

      // El staging ya cumplió: no queda objeto bajo `captures/`.
      for (const key of seeded.keys) {
        await expect(storage.head(key)).resolves.toBeNull();
      }
    } finally {
      await app.close();
    }
  });

  it('replaces the photo of a position instead of accumulating rows', async () => {
    const admin = await ensureAdminUser(database);
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Cuenca',
      currency: 'MXN',
    });

    const item = await insertItem(database, {
      eventId: event.id,
      draft: normalizeItemDraft({ title: 'Silla' }),
    });

    await createSession(database, {
      userId: null,
      eventId: event.id,
      tokenHash: hashToken(`${TOKEN}-replace`),
      scope: 'app',
      deviceLabel: 'prueba',
    });

    const storage = createMemoryObjectStore();
    const app = await startTestApp('ok', '', { database, storage });

    try {
      const first = await seedCapture(storage, event.id);
      const firstResponse = await fetch(
        `${app.baseUrl}/events/${event.id}/items/${item.id}/photos`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TOKEN}-replace`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body(first.captureId)),
        },
      );
      expect(firstResponse.status).toBe(200);
      const firstPayload = (await firstResponse.json()) as { photos: { id: string }[] };

      const second = await seedCapture(storage, event.id);
      const secondResponse = await fetch(
        `${app.baseUrl}/events/${event.id}/items/${item.id}/photos`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TOKEN}-replace`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body(second.captureId)),
        },
      );
      expect(secondResponse.status).toBe(200);
      const secondPayload = (await secondResponse.json()) as { photos: { id: string }[] };

      // La posición 0 es única: la segunda adjunción devuelve la misma foto y no acumula filas.
      expect(secondPayload.photos[0]?.id).toBe(firstPayload.photos[0]?.id);
    } finally {
      await app.close();
    }
  });

  it('refuses a capture with a missing variant without writing rows', async () => {
    const admin = await ensureAdminUser(database);
    if (admin === null) {
      return;
    }

    const event = await createEvent(database, {
      ownerUserId: admin.id,
      originCity: 'Quito',
      destinationCity: 'Loja',
      currency: 'MXN',
    });

    const item = await insertItem(database, {
      eventId: event.id,
      draft: normalizeItemDraft({ title: 'Cómoda' }),
    });

    await createSession(database, {
      userId: null,
      eventId: event.id,
      tokenHash: hashToken(`${TOKEN}-incomplete`),
      scope: 'app',
      deviceLabel: 'prueba',
    });

    const storage = createMemoryObjectStore();
    const seeded = await seedCapture(storage, event.id);
    // Falta el `thumb`: la captura está incompleta.
    await storage.delete(seeded.keys[2] ?? '');

    const app = await startTestApp('ok', '', { database, storage });

    try {
      const response = await fetch(`${app.baseUrl}/events/${event.id}/items/${item.id}/photos`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TOKEN}-incomplete`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body(seeded.captureId)),
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: 'capture_incomplete' });

      const stored = await findItem(database, event.id, item.id);
      expect(stored?.photos).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
