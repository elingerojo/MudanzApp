import { ITEM_PHOTO_ENCODING, ITEM_PHOTO_VARIANTS, type ItemPhotoVariant } from '@mudanzapp/shared';

import { exceedsTarget, nextQuality, targetDimensions } from './photo-encoding';

/**
 * Optimizador de la foto en el dispositivo (`plan-ciclo-3c-optimizar` §1 y §5).
 *
 * Es el adaptador de navegador: decodifica **una vez**, dibuja las tres variantes, las codifica con
 * el bucle de calidad de [`photo-encoding.ts`](./photo-encoding.ts) y libera los mapas de bits. La
 * foto original **no sale del teléfono**: lo que viaja es la salida del codificador.
 *
 * `canvas`, `toBlob` y `createImageBitmap` son nativos: el ciclo no añade ninguna dependencia. Si el
 * navegador no sabe decodificar lo que entrega la cámara (HEIC en algunos dispositivos), esto falla
 * con un error explícito y no sube nada: es un fallo ruidoso, no una degradación silenciosa.
 */

export interface OptimizedPhoto {
  readonly variant: ItemPhotoVariant;
  readonly blob: Blob;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** El navegador no pudo decodificar o codificar la foto. La captura no se envía. */
export class PhotoOptimizerError extends Error {
  constructor() {
    super('photo-optimization-failed');
    this.name = 'PhotoOptimizerError';
  }
}

/**
 * Orden de dibujo: la mediana primero, que es la que más se usa y la que alimenta al borrador de IA
 * de 3d. El resultado se devuelve en el orden canónico de `ITEM_PHOTO_VARIANTS`.
 */
const DRAW_ORDER: readonly ItemPhotoVariant[] = ['medium', 'thumb', 'large'];

/** Decodifica una sola vez; `createImageBitmap` cuando existe y `<img>` como respaldo. */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      throw new PhotoOptimizerError();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        resolve();
      };
      image.onerror = () => {
        reject(new PhotoOptimizerError());
      };
      image.src = url;
    });
    return image;
  } catch {
    throw new PhotoOptimizerError();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function release(bitmap: ImageBitmap | HTMLImageElement): void {
  if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) {
    bitmap.close();
  }
}

/** Codifica el lienzo a la calidad pedida; `null` cuando el navegador no soporta ese tipo. */
function encodeAt(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

/**
 * Una pasada del bucle de §4: arranca en `qualityStart` y solo baja la calidad si el resultado rebasa
 * el objetivo. Al llegar al piso se queda la codificación más pequeña obtenida **aunque supere el
 * objetivo**: la escala nunca cambia y la captura sigue adelante.
 */
async function encodeWithinTarget(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  let quality: number = ITEM_PHOTO_ENCODING.qualityStart;
  let best = await encodeAt(canvas, type, quality);

  if (best === null) {
    return null;
  }

  while (exceedsTarget(best.size)) {
    const next = nextQuality(quality);
    if (next === null) {
      break;
    }

    quality = next;
    const candidate = await encodeAt(canvas, type, quality);
    if (candidate === null) {
      break;
    }

    if (candidate.size < best.size) {
      best = candidate;
    }
  }

  return best;
}

/** WebP primero; si el navegador no lo codifica, JPEG con el mismo presupuesto de peso. */
async function encodeVariant(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const type of [ITEM_PHOTO_ENCODING.type, ITEM_PHOTO_ENCODING.fallbackType]) {
    const blob = await encodeWithinTarget(canvas, type);
    if (blob !== null) {
      return blob;
    }
  }

  throw new PhotoOptimizerError();
}

/** Dibuja una variante en un lienzo propio: sin recorte y sin ampliar. */
function draw(
  source: ImageBitmap | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  variant: ItemPhotoVariant,
): HTMLCanvasElement {
  const dimensions = targetDimensions({ widthPx: sourceWidth, heightPx: sourceHeight }, variant);

  const canvas = document.createElement('canvas');
  canvas.width = dimensions.widthPx;
  canvas.height = dimensions.heightPx;

  const context = canvas.getContext('2d');
  if (context === null) {
    throw new PhotoOptimizerError();
  }

  context.drawImage(source, 0, 0, dimensions.widthPx, dimensions.heightPx);
  return canvas;
}

/**
 * Optimiza la foto elegida en tres variantes ya listas para subir. El peso lo lleva el `blob` en
 * memoria y **no se envía como dato**: el formulario lo muestra y lo descarta.
 */
export async function optimizePhoto(file: File): Promise<OptimizedPhoto[]> {
  const bitmap = await decode(file);
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;

  try {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      throw new PhotoOptimizerError();
    }

    const byVariant = new Map<ItemPhotoVariant, OptimizedPhoto>();

    for (const variant of DRAW_ORDER) {
      const canvas = draw(bitmap, sourceWidth, sourceHeight, variant);
      const blob = await encodeVariant(canvas);

      byVariant.set(variant, {
        variant,
        blob,
        widthPx: canvas.width,
        heightPx: canvas.height,
      });

      // El lienzo se suelta en cuanto su blob existe: la memoria del teléfono es el recurso escaso.
      canvas.width = 0;
      canvas.height = 0;
    }

    return ITEM_PHOTO_VARIANTS.map((variant) => {
      const optimized = byVariant.get(variant);
      if (optimized === undefined) {
        throw new PhotoOptimizerError();
      }
      return optimized;
    });
  } finally {
    release(bitmap);
  }
}
