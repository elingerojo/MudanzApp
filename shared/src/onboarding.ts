import { z } from 'zod';

/**
 * Nivel de onboarding de un evento (corte 3k, `nivel-onboarding`).
 *
 * El nivel es un **hecho del evento**, no una preferencia del navegador ni una elección libre: se
 * deriva de cuántos artículos del evento se publicaron **alguna vez** —una fila de `app.listing`
 * conserva su evidencia aunque la ficha se despublique o se venda— y la persona puede **subirlo**
 * desde `Cuenta` cuando la promoción no le sirve.
 *
 * Cuatro reglas que este módulo no negocia:
 * - la tabla `nivel → fotos` es **dato**, no un `if`: agregar el nivel 2 no debe tocar la derivación;
 * - el efectivo es `max(derivado, piso)`: un piso menor que la evidencia no baja el nivel;
 * - el tope duro de fotos de un artículo (6) es otro hecho y no se toca aquí;
 * - la promoción es una inclinación visual, no un permiso: nada se oculta en ningún nivel.
 */

/** Cómo se promueve una acción: `promoted` lidera, `equal` pesa igual que el resto. */
export type PromotionEmphasis = 'promoted' | 'equal';

export interface OnboardingLevelDefinition {
  readonly level: number;
  /** Fotos que el borrador de IA admite en este nivel. */
  readonly photos: number;
  /** Artículos publicados alguna vez que abren este nivel. */
  readonly minPublished: number;
}

/**
 * La tabla vigente, como dato. El nivel 0 es el estado inicial de toda mudanza y el 1 la primera
 * promoción: `3` artículos publicados alguna vez.
 *
 * Un nivel nace con la acción que promueve, en su propio corte. Esta tabla no declara niveles
 * futuros —volumen o empaque— porque un nivel sin acción que promover sería un valor sin lector.
 */
export const ONBOARDING_LEVELS = [
  { level: 0, photos: 1, minPublished: 0 },
  { level: 1, photos: 2, minPublished: 3 },
] as const satisfies readonly OnboardingLevelDefinition[];

export type OnboardingLevel = (typeof ONBOARDING_LEVELS)[number]['level'];

const LAST_LEVEL_DEFINITION = ONBOARDING_LEVELS[ONBOARDING_LEVELS.length - 1];
if (LAST_LEVEL_DEFINITION === undefined) {
  throw new Error('onboarding-levels-empty');
}

/** El máximo declarado por la tabla; la frontera HTTP valida contra este valor. */
export const ONBOARDING_MAX_LEVEL: OnboardingLevel = LAST_LEVEL_DEFINITION.level;

/** La evidencia del evento: cuántos de sus artículos se publicaron alguna vez. */
export interface OnboardingEvidence {
  readonly publishedCount: number;
}

/** La definición de un nivel, con la tabla como única fuente; fuera de rango cae al nivel 0. */
function definitionFor(level: number): OnboardingLevelDefinition {
  return (
    ONBOARDING_LEVELS.find((entry) => entry.level === level) ??
    (ONBOARDING_LEVELS[0] as OnboardingLevelDefinition)
  );
}

/**
 * El nivel efectivo: **derivado de la evidencia** y elevado por el piso que la persona eligió.
 *
 * `stored` es la columna `onboarding_level` del evento y `null` significa «sin elección». Un piso
 * por encima del máximo declarado se recorta: la tabla manda sobre un valor que la frontera no
 * aceptaría. Nunca desciende por un piso menor que el derivado.
 */
export function onboardingLevelFor(
  evidence: OnboardingEvidence,
  stored: number | null,
): OnboardingLevel {
  const published = Number.isFinite(evidence.publishedCount)
    ? Math.max(0, Math.trunc(evidence.publishedCount))
    : 0;

  let derived: OnboardingLevel = 0;
  for (const entry of ONBOARDING_LEVELS) {
    if (published >= entry.minPublished) {
      derived = entry.level;
    }
  }

  const floor =
    stored === null || !Number.isFinite(stored)
      ? 0
      : Math.min(Math.max(0, Math.trunc(stored)), ONBOARDING_MAX_LEVEL);

  return Math.max(derived, floor) as OnboardingLevel;
}

/** Fotos que el borrador admite en un nivel, leídas de la tabla. */
export function photosForLevel(level: OnboardingLevel): number {
  return definitionFor(level).photos;
}

/**
 * ¿Se muestran los controles de orden de la galería? Solo con **dos fotos o más**: una permutación de
 * una sola foto no es un acto, y con la galería vacía tampoco hay nada que ordenar
 * (`plan-ciclo-3e` §4 y §5).
 *
 * La regla es la misma en la captura y en la edición, así que vive aquí y no en cada plantilla.
 */
export function orderControlsVisible(count: number): boolean {
  return Number.isFinite(count) && count >= 2;
}

export interface OnboardingPromotion {
  readonly draft: PromotionEmphasis;
  readonly retry: PromotionEmphasis;
}

/**
 * La promoción de la pantalla de captura.
 *
 * Nivel 0: el borrador de IA lidera y `Repetir la foto` es discreto —la acción que ahorra trabajo
 * pesa más que repetir—. Nivel 1: los dos pesan igual, porque el borrador ya usa dos fotos y la
 * insistencia dejaría de tener sentido. `Publicar` sigue siendo el primario real en todo nivel.
 */
export function promotionFor(level: OnboardingLevel): OnboardingPromotion {
  return level === 0 ? { draft: 'promoted', retry: 'equal' } : { draft: 'equal', retry: 'equal' };
}

/**
 * El texto de la fila de `Cuenta`, compuesto desde la tabla: la pantalla no repite el umbral.
 *
 * Nivel con un siguiente nivel: nombra las fotos de hoy y el umbral que abre el siguiente. Nivel
 * máximo: solo las fotos de hoy.
 */
export function onboardingLevelCopy(level: OnboardingLevel): string {
  const definition = definitionFor(level);
  const photos = String(definition.photos);
  const current = `El borrador de IA usa ${photos} ${definition.photos === 1 ? 'foto' : 'fotos'}.`;

  const next = ONBOARDING_LEVELS.find((entry) => entry.level > definition.level);
  if (next === undefined) {
    return current;
  }

  return `${current} Publica ${String(next.minPublished)} artículos para usar ${String(next.photos)}.`;
}

/** `PATCH /events/:eventId/onboarding-level`: una clave de más es un fallo, no un dato a medias. */
export const onboardingLevelSchema = z.strictObject({
  level: z.number().int().min(0).max(ONBOARDING_MAX_LEVEL),
});

export type OnboardingLevelRequest = z.infer<typeof onboardingLevelSchema>;

/** El efectivo después de escribir: es lo único que las superficies necesitan. */
export interface OnboardingLevelResponse {
  readonly level: OnboardingLevel;
}
