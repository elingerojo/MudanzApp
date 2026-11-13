import {
  ONBOARDING_LEVELS,
  ONBOARDING_MAX_LEVEL,
  onboardingLevelCopy,
  onboardingLevelFor,
  orderControlsVisible,
  photosForLevel,
  promotionFor,
} from '@mudanzapp/shared';

/**
 * El núcleo del corte 3k (`nivel-onboarding`): la tabla `nivel → fotos`, la derivación desde la
 * evidencia y la promoción de la pantalla de captura.
 *
 * Vive en el workspace de `frontend` porque es donde corre el gate de unidad (`test:web:frontend`);
 * las funciones son puras y viven en `shared`, y esta suite es su evidencia ejecutable.
 */
describe('onboardingLevelFor', () => {
  it('derives level 0 below three published articles and level 1 from three', () => {
    expect(onboardingLevelFor({ publishedCount: 0 }, null)).toBe(0);
    expect(onboardingLevelFor({ publishedCount: 1 }, null)).toBe(0);
    expect(onboardingLevelFor({ publishedCount: 2 }, null)).toBe(0);
    expect(onboardingLevelFor({ publishedCount: 3 }, null)).toBe(1);
    expect(onboardingLevelFor({ publishedCount: 10 }, null)).toBe(1);
  });

  it('lets the floor rise the level and never descend it', () => {
    expect(onboardingLevelFor({ publishedCount: 0 }, 1)).toBe(1);
    expect(onboardingLevelFor({ publishedCount: 5 }, 0)).toBe(1);
  });

  it('clamps a floor the table does not declare and treats a missing count as zero', () => {
    expect(onboardingLevelFor({ publishedCount: 0 }, 9)).toBe(ONBOARDING_MAX_LEVEL);
    expect(onboardingLevelFor({ publishedCount: Number.NaN }, 0)).toBe(0);
  });
});

describe('promotionFor', () => {
  it('promotes the draft and leaves the retry discrete at level 0', () => {
    expect(promotionFor(0)).toEqual({ draft: 'promoted', retry: 'equal' });
  });

  it('makes both actions weigh the same at level 1', () => {
    expect(promotionFor(1)).toEqual({ draft: 'equal', retry: 'equal' });
  });
});

describe('photosForLevel', () => {
  it('reads the photo count of the table, under the hard cap of six', () => {
    expect(photosForLevel(0)).toBe(1);
    expect(photosForLevel(1)).toBe(2);
    expect(photosForLevel(1)).toBeLessThan(6);
  });
});

describe('onboardingLevelCopy', () => {
  it('names the threshold from the table instead of repeating it', () => {
    const next = ONBOARDING_LEVELS[1];
    expect(next).toBeDefined();
    expect(onboardingLevelCopy(0)).toContain(`Publica ${String(next?.minPublished)} artículos`);
    expect(onboardingLevelCopy(0)).toContain('usa 1 foto');
  });

  it('publishes only the current photos at the highest level', () => {
    expect(onboardingLevelCopy(ONBOARDING_MAX_LEVEL)).toBe('El borrador de IA usa 2 fotos.');
  });
});

/**
 * La regla del corte 3e (`gallery`): los controles de orden solo existen con dos fotos o más, y es
 * la misma regla en la captura y en la edición.
 */
describe('orderControlsVisible', () => {
  it('hides the order controls with zero or one photo', () => {
    expect(orderControlsVisible(0)).toBe(false);
    expect(orderControlsVisible(1)).toBe(false);
  });

  it('shows the order controls from two photos', () => {
    expect(orderControlsVisible(2)).toBe(true);
    expect(orderControlsVisible(6)).toBe(true);
  });
});
