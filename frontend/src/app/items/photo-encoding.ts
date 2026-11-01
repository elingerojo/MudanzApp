import { ITEM_PHOTO_ENCODING, ITEM_PHOTO_SIZES, type ItemPhotoVariant } from '@mudanzapp/shared';

/**
 * Reglas de la escala y del bucle de calidad, **puras y sin DOM**
 * (`plan-ciclo-3c-optimizar` §4 y §5).
 *
 * Aquí vive todo lo que una prueba unitaria puede leer sin canvas: qué dimensiones tiene cada
 * variante, cuál es la siguiente calidad y si un resultado rebasa el objetivo. El adaptador de
 * navegador ([`photo-optimizer.ts`](./photo-optimizer.ts)) solo ejecuta estas decisiones.
 */

export interface Dimensions {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Dimensiones de una variante: lado mayor acotado a `maxEdgePx` de **su** tamaño, sin recortar y sin
 * ampliar. Una fuente menor que el tamaño se queda tal cual: una mediana de 600 px no llega a 768 y
 * eso es correcto.
 */
export function targetDimensions(source: Dimensions, variant: ItemPhotoVariant): Dimensions {
  const maxEdgePx = ITEM_PHOTO_SIZES[variant].maxEdgePx;
  const longest = Math.max(source.widthPx, source.heightPx);

  if (longest <= maxEdgePx) {
    return { widthPx: source.widthPx, heightPx: source.heightPx };
  }

  const scale = maxEdgePx / longest;

  return {
    widthPx: Math.max(1, Math.round(source.widthPx * scale)),
    heightPx: Math.max(1, Math.round(source.heightPx * scale)),
  };
}

/**
 * La siguiente calidad del bucle, o `null` cuando ya se está en el piso. Se redondea a dos decimales
 * porque `0.8 - 0.05` en coma flotante no es `0.75` exacto y el resultado viajaría al codificador.
 */
export function nextQuality(quality: number): number | null {
  const next = Math.round((quality - ITEM_PHOTO_ENCODING.qualityStep) * 100) / 100;
  return next < ITEM_PHOTO_ENCODING.qualityFloor ? null : next;
}

/** ¿El resultado rebasa el objetivo de peso? Es un objetivo que solo aplica al codificador. */
export function exceedsTarget(byteSize: number): boolean {
  return byteSize > ITEM_PHOTO_ENCODING.targetBytes;
}

/** Peso legible para la tarjeta de la captura. Es un dato efímero: se muestra y se descarta. */
export function formatWeight(byteSize: number): string {
  if (byteSize < 1024) {
    return `${String(byteSize)} B`;
  }

  const kilobytes = byteSize / 1024;
  return `${String(Math.round(kilobytes))} KB`;
}

/** Etiqueta de un tamaño: «768 px · 121 KB». El peso no viaja al backend, solo se enseña. */
export function sizeLabel(dimensions: Dimensions, byteSize: number): string {
  const longest = Math.max(dimensions.widthPx, dimensions.heightPx);
  return `${String(longest)} px · ${formatWeight(byteSize)}`;
}
