import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  consumeFakeUploadGrant,
  createFileObjectStore,
  FAKE_UPLOAD_PATH,
} from '../../src/storage/r2-fake.js';

/**
 * El doble del almacén (`R2_MODE=fake`) con las operaciones que el ciclo 4g añade: prefirmar, leer
 * metadatos, copiar y borrar. Se ejecuta sobre un directorio temporal propio para que la prueba no
 * comparta estado con una captura manual.
 */
describe('r2 fake object store', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mudanzapp-r2-fake-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads back the bytes and the content type it wrote', async () => {
    const store = createFileObjectStore(root);

    await store.put('event/captures/cap/large', Buffer.from('pixels'), 'image/webp');

    await expect(store.get('event/captures/cap/large')).resolves.toEqual({
      bytes: Buffer.from('pixels'),
      contentType: 'image/webp',
    });
  });

  it('reports the real size and type with head, and null when the key is absent', async () => {
    const store = createFileObjectStore(root);
    await store.put('event/captures/cap/medium', Buffer.from('12345'), 'image/jpeg');

    await expect(store.head('event/captures/cap/medium')).resolves.toEqual({
      contentType: 'image/jpeg',
      byteSize: 5,
    });
    await expect(store.head('event/captures/cap/thumb')).resolves.toBeNull();
  });

  it('signs a relative url that the api can exchange for a write', async () => {
    const store = createFileObjectStore(root);

    const url = await store.presignPut('event/captures/cap/large', 'image/webp', 900);

    expect(url.startsWith(`${FAKE_UPLOAD_PATH}?token=`)).toBe(true);

    const token = url.slice(url.indexOf('token=') + 'token='.length);
    expect(consumeFakeUploadGrant(token)).toEqual({
      key: 'event/captures/cap/large',
      contentType: 'image/webp',
    });
    expect(consumeFakeUploadGrant('not-a-token')).toBeNull();
  });

  it('refuses to sign a key that escapes the root', async () => {
    const store = createFileObjectStore(root);

    await expect(store.presignPut('../escape', 'image/webp', 900)).rejects.toMatchObject({
      code: 'internal_error',
    });
  });

  it('copies the bytes and the type, and fails when the source is missing', async () => {
    const store = createFileObjectStore(root);
    await store.put('event/captures/cap/large', Buffer.from('pixels'), 'image/webp');

    await store.copy('event/captures/cap/large', 'event/item/photo-large');

    await expect(store.get('event/item/photo-large')).resolves.toEqual({
      bytes: Buffer.from('pixels'),
      contentType: 'image/webp',
    });
    await expect(store.copy('event/missing', 'event/item/x')).rejects.toMatchObject({
      code: 'internal_error',
    });
  });

  it('deletes idempotently', async () => {
    const store = createFileObjectStore(root);
    await store.put('event/captures/cap/thumb', Buffer.from('pixels'), 'image/webp');

    await store.delete('event/captures/cap/thumb');
    await store.delete('event/captures/cap/thumb');

    await expect(store.head('event/captures/cap/thumb')).resolves.toBeNull();
  });
});
