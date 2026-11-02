import { indexVersion, type EventCardEntry } from '@mudanzapp/shared';

/**
 * La regla de la clave de versión (ciclo 4a, `plan-ciclo-4a` §3 y §10).
 *
 * La versión es un hash de **exactamente** los campos que la tarjeta pinta: si incluyera uno que no
 * se pinta, cada edición reescribiría la página pública; si omitiera uno que sí se pinta, la tarjeta
 * quedaría vieja y en silencio.
 */
const EVENT = { originCity: 'Bogotá', destinationCity: 'Ciudad de México', currency: 'MXN' };

const FIRST: EventCardEntry = {
  slug: 'silla-de-madera-3f9a2c',
  title: 'Silla de madera',
  publishedAt: '2026-10-31T12:00:00.000Z',
  priceCents: 125_050,
  thumb: {
    url: 'https://fake.r2.local/event/item/uuid-thumb',
    widthPx: 320,
    heightPx: 240,
  },
};

const SECOND: EventCardEntry = {
  slug: 'mesa-de-roble-4a1b3c',
  title: 'Mesa de roble',
  publishedAt: '2026-10-30T12:00:00.000Z',
  priceCents: null,
  thumb: null,
};

function versionOf(listings: readonly EventCardEntry[], event = EVENT): string {
  return indexVersion({ event, listings });
}

describe('indexVersion', () => {
  it('is stable for the same painted content', () => {
    expect(versionOf([FIRST, SECOND])).toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when a painted title changes', () => {
    const renamed = { ...FIRST, title: 'Silla de madera pulida' };

    expect(versionOf([renamed, SECOND])).not.toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when a painted thumbnail changes', () => {
    const replaced: EventCardEntry = {
      ...FIRST,
      thumb: {
        url: 'https://fake.r2.local/event/item/other-thumb',
        widthPx: 320,
        heightPx: 240,
      },
    };

    expect(versionOf([replaced, SECOND])).not.toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when the event header cities change', () => {
    const other = { ...EVENT, originCity: 'Lima', destinationCity: 'Santiago' };

    expect(versionOf([FIRST, SECOND], other)).not.toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when a painted price changes', () => {
    const cheaper = { ...FIRST, priceCents: 99_900 };

    expect(versionOf([cheaper, SECOND])).not.toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when the published order changes', () => {
    expect(versionOf([SECOND, FIRST])).not.toBe(versionOf([FIRST, SECOND]));
  });

  it('ignores fields the card does not paint, like note or weightKg', () => {
    const withUnpainted = {
      ...FIRST,
      note: 'Nota que no aparece en la tarjeta',
      weightKg: 12.5,
      widthCm: 45,
    } as EventCardEntry;

    expect(versionOf([withUnpainted, SECOND])).toBe(versionOf([FIRST, SECOND]));
  });

  it('ignores a different instant that paints the same day', () => {
    const sameDay = { ...FIRST, publishedAt: '2026-10-31T23:59:59.000Z' };

    expect(versionOf([sameDay, SECOND])).toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when the published day changes', () => {
    const nextDay = { ...FIRST, publishedAt: '2026-11-01T12:00:00.000Z' };

    expect(versionOf([nextDay, SECOND])).not.toBe(versionOf([FIRST, SECOND]));
  });

  it('changes when a thumbnail disappears', () => {
    expect(versionOf([{ ...FIRST, thumb: null }, SECOND])).not.toBe(versionOf([FIRST, SECOND]));
  });
});
