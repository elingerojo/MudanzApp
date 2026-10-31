import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

import { createR2ObjectStore } from '../../src/storage/r2-live.js';

/**
 * El adaptador `live` sin red (`plan-ciclo-3c` §7): el cliente se inyecta, así que lo que se prueba es
 * el mapeo de errores, la forma de los comandos y la composición de la URL pública. El gate no tiene
 * credenciales y no las necesita: el píxel es un hecho de plataforma.
 */
const BUCKET = 'mudanzapp-photos';
const PUBLIC_BASE = 'https://pub-test.r2.dev';

/** El cliente real es el del SDK; el doble solo necesita `send`. */
function storeWith(send: (command: unknown) => Promise<unknown>) {
  return createR2ObjectStore({
    client: { send } as unknown as Pick<S3Client, 'send'>,
    bucket: BUCKET,
    publicBaseUrl: PUBLIC_BASE,
  });
}

function missingObject(): Error {
  const error = new Error('The specified key does not exist.');
  return Object.assign(error, { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
}

describe('r2 live object store', () => {
  it('reads an object with its content type', async () => {
    const store = storeWith((command) => {
      expect(command).toBeInstanceOf(GetObjectCommand);

      return Promise.resolve({
        Body: { transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
        ContentType: 'image/png',
      });
    });

    const object = await store.get('event/item/photo');

    expect(object?.contentType).toBe('image/png');
    expect(object?.bytes).toEqual(Buffer.from([1, 2, 3]));
  });

  it('returns null for a key that is not in the bucket', async () => {
    const store = storeWith(() => Promise.reject(missingObject()));

    await expect(store.get('event/item/photo')).resolves.toBeNull();
  });

  it('returns null when the response carries no body', async () => {
    const store = storeWith(() => Promise.resolve({}));

    await expect(store.get('event/item/photo')).resolves.toBeNull();
  });

  it('translates any other read failure into r2_unavailable', async () => {
    const store = storeWith(() => Promise.reject(new Error('socket hang up')));

    await expect(store.get('event/item/photo')).rejects.toMatchObject({ code: 'r2_unavailable' });
  });

  it('sends the key, the bytes and the content type on put', async () => {
    const sent: unknown[] = [];
    const store = storeWith((command) => {
      sent.push(command);
      return Promise.resolve({});
    });

    await store.put('event/item/photo', Buffer.from('pixels'), 'image/png');

    const [command] = sent;
    expect(command).toBeInstanceOf(PutObjectCommand);

    const { input } = command as PutObjectCommand;
    expect(input.Bucket).toBe(BUCKET);
    expect(input.Key).toBe('event/item/photo');
    expect(input.ContentType).toBe('image/png');
    expect(input.Body).toBeInstanceOf(Uint8Array);
  });

  it('translates a write failure into r2_unavailable', async () => {
    const store = storeWith(() => Promise.reject(new Error('access denied')));

    await expect(
      store.put('event/item/photo', Buffer.from('pixels'), 'image/png'),
    ).rejects.toMatchObject({ code: 'r2_unavailable' });
  });

  it('composes an unsigned public url with a single slash', () => {
    const store = storeWith(() => Promise.reject(new Error('not used')));

    const url = store.publicUrl('/event/item/photo');

    expect(url).toBe(`${PUBLIC_BASE}/event/item/photo`);
    expect(url).not.toContain('X-Amz');
    expect(url).not.toContain('?');
  });

  it('does not duplicate the slash when the base ends with one', () => {
    const store = createR2ObjectStore({
      client: { send: () => Promise.reject(new Error('not used')) } as unknown as Pick<
        S3Client,
        'send'
      >,
      bucket: BUCKET,
      publicBaseUrl: `${PUBLIC_BASE}/`,
    });

    expect(store.publicUrl('event/item/photo')).toBe(`${PUBLIC_BASE}/event/item/photo`);
  });
});
