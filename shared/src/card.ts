/**
 * Modelo **único** de la tarjeta del índice público del evento (ciclo 4a, `event-index`).
 *
 * La tarjeta se pinta dos veces —el backend compone el snapshot HTML y Angular compone el suyo— y
 * ninguna de las dos partes calcula un texto por su cuenta: ambas colocan lo que devuelve
 * [`cardModel()`](shared/src/card.ts:1). Es la pieza que sostiene la paridad de las dos
 * renderizaciones (`plan-ciclo-4a` §3 y §7).
 *
 * `publishedLabel` se compone **a mano** desde el instante ISO en una zona fija (UTC), sin `Intl`:
 * dos runtimes con ICU distinta no pueden producir el mismo texto, y una etiqueta distinta rompería
 * la garantía de que retirar el snapshot no mueve un píxel.
 */

/** Recorte del título en la tarjeta. Sin elipsis: las dos renderizaciones recortan igual. */
export const EVENT_CARD_LIMITS = { title: 80 } as const;

/**
 * `sizes` fijo: una columna en móvil y dos desde `sm` (640 px).
 *
 * `NgOptimizedImage` antepone `auto, ` a cualquier `sizes` que reciba; es una pista del navegador que
 * no cambia la caja reservada, y la prueba de paridad la normaliza junto a los demás atributos que
 * añade el framework.
 */
export const EVENT_CARD_SIZES = '(min-width: 640px) 50vw, 100vw';

/**
 * La miniatura publicada del artículo. Solo el tamaño `thumb`: la tarjeta no descarga la mediana.
 * `null` cuando el artículo no tiene variante `thumb` (fotos anteriores a `3c-optimizar`).
 */
export interface EventCardThumb {
  readonly url: string;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Entrada de la tarjeta: exactamente lo que publica `GET /public/events/:publicSlug`. */
export interface EventCardEntry {
  readonly slug: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly thumb: EventCardThumb | null;
}

/**
 * Descriptor de la imagen, ya resuelto: `src`, `srcset`, `sizes` y las dimensiones **reales**. El
 * backend lo escribe en un `<img>` y Angular lo entrega a `NgOptimizedImage`; nadie lo recompone.
 *
 * `descriptor` (`320w`) es la forma que `NgOptimizedImage` exige en `ngSrcset`: la directiva no
 * acepta URLs en esa entrada —las compone ella con el loader— y el servidor necesita la forma
 * completa (`srcset`). Las dos salen del mismo modelo.
 */
export interface EventCardImage {
  readonly src: string;
  readonly srcset: string;
  readonly descriptor: string;
  readonly sizes: string;
  readonly width: number;
  readonly height: number;
}

/** Todo lo que la tarjeta muestra. Ni un texto más. */
export interface EventCardModel {
  readonly slug: string;
  readonly href: string;
  readonly title: string;
  readonly publishedLabel: string;
  readonly alt: string;
  readonly image: EventCardImage | null;
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * Etiqueta de publicación desde el instante ISO, en UTC y sin `Intl`. Un instante inválido devuelve
 * cadena vacía: el contrato público solo emite ISO válidos (`toISOString`), así que ese caso nunca
 * aparece en producción y no se inventa una fecha.
 */
export function publishedLabel(publishedAt: string): string {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = `${String(date.getUTCFullYear())}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
  return `Publicado el ${day}`;
}

/**
 * La tarjeta resuelta. El `href` es la ruta de la ficha (`/<slug>`) y **no** un origen: el origen de
 * `shop` es configuración compilada, no un hecho del contrato.
 */
export function cardModel(entry: EventCardEntry): EventCardModel {
  const title = entry.title.trim().slice(0, EVENT_CARD_LIMITS.title);
  const thumb = entry.thumb;

  // Un tamaño sin dimensiones no reserva caja: la tarjeta muestra su marcador en las dos
  // renderizaciones, igual que la ficha hace con las fotos heredadas.
  const image =
    thumb === null || thumb.widthPx <= 0 || thumb.heightPx <= 0
      ? null
      : {
          src: thumb.url,
          srcset: `${thumb.url} ${String(thumb.widthPx)}w`,
          descriptor: `${String(thumb.widthPx)}w`,
          sizes: EVENT_CARD_SIZES,
          width: thumb.widthPx,
          height: thumb.heightPx,
        };

  return {
    slug: entry.slug,
    href: `/${entry.slug}`,
    title,
    publishedLabel: publishedLabel(entry.publishedAt),
    alt: `Foto de ${title}`,
    image,
  };
}
