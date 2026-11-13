import {
  AI_DRAFT_LIMITS,
  PHOTO_BUNDLE_HEADER_BYTES,
  PhotoBundleError,
  decodePhotoBundle,
  encodePhotoBundle,
  type PhotoBundlePart,
} from '@mudanzapp/shared';

/**
 * El framing del cuerpo del borrador (corte 3i, `plan-ciclo-3i` §4 y §7).
 *
 * Una sola fuente para el formato: ida y vuelta con una, dos y seis fotos —bytes idénticos y mismo
 * orden— y los rechazos que el decodificador **no** repara: cabecera corrupta o de más de 1 KiB,
 * cantidad fuera de `1..6`, parte vacía, suma que no cuadra, bytes sobrantes y total sobre el tope.
 */

const HEADER_BYTES = 4;

/** Un byte distinto por foto: si el orden se pierde, la comparación lo dice. */
function photo(value: number, contentType = 'image/webp'): PhotoBundlePart {
  return { contentType, bytes: Uint8Array.of(value, value + 1, value + 2) };
}

/** Compone un cuerpo a mano para los casos que el codificador no puede producir. */
function frame(header: unknown, blobs: readonly Uint8Array[]): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const total = HEADER_BYTES + headerBytes.byteLength + blobs.reduce((sum, b) => sum + b.length, 0);
  const body = new Uint8Array(total);
  new DataView(body.buffer).setUint32(0, headerBytes.byteLength, false);
  body.set(headerBytes, HEADER_BYTES);

  let offset = HEADER_BYTES + headerBytes.byteLength;
  for (const blob of blobs) {
    body.set(blob, offset);
    offset += blob.length;
  }

  return body;
}

/** El código estable del rechazo, sin depender del mensaje. */
function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof PhotoBundleError) {
      return error.code;
    }

    throw error;
  }

  throw new Error('expected-photo-bundle-error');
}

describe('photo bundle', () => {
  it.each([1, 2, 6])('round-trips %i photo(s) with identical bytes and order', (count) => {
    const parts = Array.from({ length: count }, (_, index) => photo(10 * index + 1));

    const decoded = decodePhotoBundle(encodePhotoBundle(parts));

    expect(decoded).toHaveLength(count);
    expect(decoded.map((entry) => entry.contentType)).toEqual(
      parts.map((part) => part.contentType),
    );
    expect(decoded.map((entry) => Array.from(entry.bytes))).toEqual(
      parts.map((part) => Array.from(part.bytes)),
    );
  });

  it('keeps the order of the array, never a position field', () => {
    const first = photo(1);
    const second = photo(50, 'image/jpeg');

    const decoded = decodePhotoBundle(encodePhotoBundle([first, second]));

    expect(decoded[0]?.bytes[0]).toBe(1);
    expect(decoded[1]?.bytes[0]).toBe(50);
    expect(decoded[1]?.contentType).toBe('image/jpeg');
  });

  it('rejects an empty list and one over the hard cap', () => {
    expect(codeOf(() => encodePhotoBundle([]))).toBe('bundle_photo_invalid');

    const over = Array.from({ length: AI_DRAFT_LIMITS.photos + 1 }, (_, index) => photo(index + 1));
    expect(codeOf(() => encodePhotoBundle(over))).toBe('bundle_photo_invalid');

    const header = {
      photos: over.map((entry) => ({
        contentType: entry.contentType,
        byteLength: entry.bytes.byteLength,
      })),
    };
    expect(
      codeOf(() =>
        decodePhotoBundle(
          frame(
            header,
            over.map((entry) => entry.bytes),
          ),
        ),
      ),
    ).toBe('bundle_photo_invalid');
  });

  it('rejects a header longer than one KiB', () => {
    const body = frame({ photos: [{ contentType: 'x'.repeat(PHOTO_BUNDLE_HEADER_BYTES) }] }, []);

    expect(codeOf(() => decodePhotoBundle(body))).toBe('bundle_malformed');
  });

  it('rejects a header that is not JSON and a header with an extra key', () => {
    const broken = Uint8Array.of(0, 0, 0, 3, 0x7b, 0x7b, 0x7b);

    expect(codeOf(() => decodePhotoBundle(broken))).toBe('bundle_malformed');
    expect(codeOf(() => decodePhotoBundle(frame({ photos: [], count: 1 }, [])))).toBe(
      'bundle_malformed',
    );
  });

  it('rejects a part declared as empty and a type the store does not admit', () => {
    const empty = frame({ photos: [{ contentType: 'image/webp', byteLength: 0 }] }, []);
    expect(codeOf(() => decodePhotoBundle(empty))).toBe('bundle_photo_invalid');

    const wrongType = frame({ photos: [{ contentType: 'image/gif', byteLength: 3 }] }, [
      Uint8Array.of(1, 2, 3),
    ]);
    expect(codeOf(() => decodePhotoBundle(wrongType))).toBe('bundle_photo_invalid');

    expect(codeOf(() => encodePhotoBundle([photo(1, 'image/gif')]))).toBe('bundle_photo_invalid');
    expect(
      codeOf(() => encodePhotoBundle([{ contentType: 'image/webp', bytes: new Uint8Array(0) }])),
    ).toBe('bundle_photo_invalid');
  });

  it('rejects a length that does not add up and trailing bytes', () => {
    const shortByOne = frame({ photos: [{ contentType: 'image/webp', byteLength: 4 }] }, [
      Uint8Array.of(1, 2, 3),
    ]);
    expect(codeOf(() => decodePhotoBundle(shortByOne))).toBe('bundle_malformed');

    const withTrailing = frame({ photos: [{ contentType: 'image/webp', byteLength: 3 }] }, [
      Uint8Array.of(1, 2, 3, 4),
    ]);
    expect(codeOf(() => decodePhotoBundle(withTrailing))).toBe('bundle_malformed');
  });

  it('rejects a body over the transport cap', () => {
    const overTheCap = new Uint8Array(AI_DRAFT_LIMITS.bundleBytes + 1);

    expect(codeOf(() => decodePhotoBundle(overTheCap))).toBe('bundle_too_large');

    const megabyte = new Uint8Array(1024 * 1024);
    const photos = Array.from({ length: AI_DRAFT_LIMITS.photos }, () => ({
      contentType: 'image/webp',
      bytes: megabyte,
    }));
    expect(codeOf(() => encodePhotoBundle(photos))).toBe('bundle_too_large');
  });
});
