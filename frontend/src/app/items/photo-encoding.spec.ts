import { ITEM_PHOTO_ENCODING } from '@mudanzapp/shared';

import {
  exceedsTarget,
  formatWeight,
  nextQuality,
  sizeLabel,
  targetDimensions,
} from './photo-encoding';

/**
 * Evidencia unitaria del ciclo 3c-optimizar (`plan-ciclo-3c-optimizar` §7): la escala de cada tamaño
 * y el bucle de calidad, sin DOM y sin canvas.
 */

describe('targetDimensions', () => {
  it('caps the longest edge of each size and keeps the proportion', () => {
    const source = { widthPx: 4_000, heightPx: 3_000 };

    expect(targetDimensions(source, 'thumb')).toEqual({ widthPx: 320, heightPx: 240 });
    expect(targetDimensions(source, 'medium')).toEqual({ widthPx: 768, heightPx: 576 });
    expect(targetDimensions(source, 'large')).toEqual({ widthPx: 1_440, heightPx: 1_080 });
  });

  it('caps the height when the photo is portrait', () => {
    expect(targetDimensions({ widthPx: 2_000, heightPx: 3_000 }, 'medium')).toEqual({
      widthPx: 512,
      heightPx: 768,
    });
  });

  it('never enlarges a source smaller than the size', () => {
    const small = { widthPx: 400, heightPx: 300 };

    expect(targetDimensions(small, 'medium')).toEqual(small);
    expect(targetDimensions(small, 'large')).toEqual(small);
  });

  it('never crops: the ratio of the source survives in every size', () => {
    const source = { widthPx: 3_000, heightPx: 2_000 };
    const medium = targetDimensions(source, 'medium');

    expect(medium.widthPx / medium.heightPx).toBeCloseTo(source.widthPx / source.heightPx, 1);
  });
});

describe('nextQuality', () => {
  it('steps down from the start quality and stops at the floor', () => {
    expect(nextQuality(ITEM_PHOTO_ENCODING.qualityStart)).toBe(0.75);
    expect(nextQuality(0.6)).toBe(0.55);
    expect(nextQuality(ITEM_PHOTO_ENCODING.qualityFloor)).toBeNull();
  });

  it('never returns a quality below the floor', () => {
    let quality: number | null = ITEM_PHOTO_ENCODING.qualityStart;

    while (quality !== null) {
      expect(quality).toBeGreaterThanOrEqual(ITEM_PHOTO_ENCODING.qualityFloor);
      quality = nextQuality(quality);
    }
  });

  it('walks exactly the expected number of steps down to the floor', () => {
    const steps: number[] = [];
    let quality: number | null = ITEM_PHOTO_ENCODING.qualityStart;

    while (quality !== null) {
      steps.push(quality);
      quality = nextQuality(quality);
    }

    expect(steps.at(-1)).toBe(0.5);
    expect(steps).toHaveLength(7);
  });
});

describe('exceedsTarget', () => {
  it('compares against the configurable target', () => {
    expect(exceedsTarget(ITEM_PHOTO_ENCODING.targetBytes)).toBe(false);
    expect(exceedsTarget(ITEM_PHOTO_ENCODING.targetBytes + 1)).toBe(true);
  });
});

describe('sizeLabel', () => {
  it('shows the longest edge and the real weight, which is never sent', () => {
    expect(sizeLabel({ widthPx: 768, heightPx: 576 }, 121 * 1024)).toBe('768 px · 121 KB');
    expect(sizeLabel({ widthPx: 320, heightPx: 240 }, 38 * 1024)).toBe('320 px · 38 KB');
    expect(formatWeight(512)).toBe('512 B');
  });
});
