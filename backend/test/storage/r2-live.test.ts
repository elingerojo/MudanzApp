import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';

import type { PresignPut, PresignPutInput } from '../../src/storage/object-store.js';
import { createR2ObjectStore } from '../../src/storage/r2-live.js';

/**
 * El adaptador `live` sin red (`plan-ciclo-3c` §7): el cliente se inyecta, así que lo que se prueba es
 * el mapeo de errores, la forma de los comandos y la composición de la URL pública. El gate no tiene
 * credenciales y no las necesita: el píxel es un hecho de plataforma.
 */
const BUCKET = 'mudanzapp-photos';
const PUBLIC_BASE = 'https://pub-test.r2.dev';

/** El cliente real es el del SDK; el doble solo necesita `send`. */
function storeWith(
  send: (command: unknown) => Promise<unknown>,
  presign: PresignPut = () => Promise.resolve('https://signed.test/put'),
) {
  return createR2ObjectStore({
    client: { send } as unknown as Pick<S3Client, 'send'>,
    bucket: BUCKET,
    publicBaseUrl: PUBLIC_BASE,
    presign,
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
      presign: () => Promise.resolve('https://signed.test/put'),
    });

    expect(store.publicUrl('event/item/photo')).toBe(`${PUBLIC_BASE}/event/item/photo`);
  });

  it('signs a write with the declared type and the requested lifetime', async () => {
    const calls: PresignPutInput[] = [];
    const store = storeWith(
      () => Promise.reject(new Error('not used')),
      (input) => {
        calls.push(input);
        return Promise.resolve('https://signed.test/put?X-Amz-Signature=abc');
      },
    );

    const url = await store.presignPut('event/captures/cap/large', 'image/webp', 900);

    expect(url).toContain('X-Amz-Signature');
    expect(calls).toEqual([
      { key: 'event/captures/cap/large', contentType: 'image/webp', expiresInSeconds: 900 },
    ]);
  });

  it('translates a signing failure into r2_unavailable', async () => {
    const store = storeWith(
      () => Promise.reject(new Error('not used')),
      () => Promise.reject(new Error('no credentials')),
    );

    await expect(store.presignPut('k', 'image/webp', 900)).rejects.toMatchObject({
      code: 'r2_unavailable',
    });
  });

  it('reads the real type and size of an object with head', async () => {
    const store = storeWith((command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);

      return Promise.resolve({ ContentType: 'image/webp', ContentLength: 1234 });
    });

    await expect(store.head('event/item/photo')).resolves.toEqual({
      contentType: 'image/webp',
      byteSize: 1234,
    });
  });

  it('returns null from head when the object is not there', async () => {
    const store = storeWith(() => Promise.reject(missingObject()));

    await expect(store.head('event/item/photo')).resolves.toBeNull();
  });

  it('copies inside the bucket with the source encoded and the bucket in front', async () => {
    const sent: unknown[] = [];
    const store = storeWith((command) => {
      sent.push(command);
      return Promise.resolve({});
    });

    await store.copy('event/captures/cap/large', 'event/item/photo-large');

    const [command] = sent;
    expect(command).toBeInstanceOf(CopyObjectCommand);

    const { input } = command as CopyObjectCommand;
    expect(input.Bucket).toBe(BUCKET);
    expect(input.Key).toBe('event/item/photo-large');
    expect(input.CopySource).toBe(`${BUCKET}/event/captures/cap/large`);
  });

  it('translates a copy failure into r2_unavailable', async () => {
    const store = storeWith(() => Promise.reject(new Error('access denied')));

    await expect(store.copy('a', 'b')).rejects.toMatchObject({ code: 'r2_unavailable' });
  });

  it('deletes by key and tolerates a failure with the stable code', async () => {
    const sent: unknown[] = [];
    const store = storeWith((command) => {
      sent.push(command);
      return Promise.resolve({});
    });

    await store.delete('event/captures/cap/large');

    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[0] as DeleteObjectCommand).input.Key).toBe('event/captures/cap/large');

    const failing = storeWith(() => Promise.reject(new Error('access denied')));
    await expect(failing.delete('k')).rejects.toMatchObject({ code: 'r2_unavailable' });
  });
});
