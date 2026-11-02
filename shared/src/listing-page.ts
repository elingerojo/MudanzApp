import { publishedLabel, type EventCardImage } from './card.js';
import { fnv1a64 } from './hash.js';
import type { PublicListing, PublicPhotoSize } from './listing.js';
import { formatPriceCents } from './price.js';

/**
 * Modelo **único** de la ficha pública del artículo (ciclo 4b).
 *
 * La ficha se pinta dos veces —el backend compone el snapshot HTML y Angular compone el suyo— y
 * ninguna de las dos partes calcula un texto por su cuenta: ambas colocan lo que devuelve
 * [`listingPageModel()`](shared/src/listing-page.ts:1). Es la misma regla que sostiene la tarjeta del
 * índice desde el ciclo 4a.
 *
 * `listingVersion()` hashea exactamente lo que la ficha pinta, incluidos el precio y la etiqueta
 * `Vendido`: un cambio de precio, de texto o de estado cambia el `ETag` y la copia se regenera.
 */

/** `sizes` de la mediana: ocupa el ancho de la columna en la ficha. */
const MEDIUM_SIZES = '100vw';

/** `sizes` de la miniatura: la caja fija que la ficha ya reserva. */
const THUMB_SIZES = '96px';

export interface ListingPageLarge {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/** La foto de la ficha con la caída heredada ya resuelta: la mediana y la miniatura usan la grande. */
export interface ListingPagePhoto {
  readonly medium: EventCardImage | null;
  readonly thumb: EventCardImage | null;
  readonly large: ListingPageLarge | null;
}

/** Todo lo que la ficha muestra. Ni un texto más. */
export interface ListingPageModel {
  readonly slug: string;
  readonly title: string;
  readonly priceLabel: string;
  readonly soldLabel: string | null;
  readonly citiesLabel: string;
  readonly measuresLabel: string | null;
  readonly note: string | null;
  readonly publishedLabel: string;
  readonly eventHref: string;
  readonly alt: string;
  readonly photo: ListingPagePhoto | null;
}

function imageOf(size: PublicPhotoSize | null, sizes: string): EventCardImage | null {
  if (size === null) {
    return null;
  }

  const hasDimensions = size.widthPx > 0 && size.heightPx > 0;

  return {
    src: size.url,
    srcset: hasDimensions ? `${size.url} ${String(size.widthPx)}w` : '',
    descriptor: hasDimensions ? `${String(size.widthPx)}w` : '',
    sizes,
    width: size.widthPx,
    height: size.heightPx,
  };
}

/**
 * Medidas de la ficha: las tres dimensiones cuando están completas y, si no, solo el peso cuando
 * existe. Es el mismo texto que la superficie privada ya muestra y no se compone dos veces.
 */
export function measuresLabel(
  widthCm: number | null,
  heightCm: number | null,
  depthCm: number | null,
  weightKg: number | null,
): string | null {
  if (widthCm !== null && heightCm !== null && depthCm !== null) {
    const dimensions = `${String(widthCm)} × ${String(heightCm)} × ${String(depthCm)} cm`;
    return weightKg === null ? dimensions : `${dimensions} · ${String(weightKg)} kg`;
  }

  return weightKg === null ? null : `${String(weightKg)} kg`;
}

/**
 * La ficha resuelta. El `eventHref` es la ruta del índice (`/evento/<publicSlug>`), no un origen: el
 * origen de `shop` es configuración compilada, no un hecho del contrato.
 */
export function listingPageModel(listing: PublicListing): ListingPageModel {
  const sizes = listing.photo?.sizes ?? null;
  const largeSize = sizes?.large ?? null;
  const mediumSize = sizes?.medium ?? largeSize;
  const thumbSize = sizes?.thumb ?? largeSize;

  const photo =
    mediumSize === null && thumbSize === null && largeSize === null
      ? null
      : {
          medium: imageOf(mediumSize, MEDIUM_SIZES),
          thumb: imageOf(thumbSize, THUMB_SIZES),
          large:
            largeSize === null
              ? null
              : {
                  src: largeSize.url,
                  width: largeSize.widthPx,
                  height: largeSize.heightPx,
                },
        };

  return {
    slug: listing.slug,
    title: listing.title,
    priceLabel: formatPriceCents(listing.priceCents, listing.event.currency),
    soldLabel: listing.soldAt === null ? null : 'Vendido',
    citiesLabel: `${listing.event.originCity} → ${listing.event.destinationCity}`,
    measuresLabel: measuresLabel(
      listing.widthCm,
      listing.heightCm,
      listing.depthCm,
      listing.weightKg,
    ),
    note: listing.note,
    publishedLabel: publishedLabel(listing.publishedAt),
    eventHref: `/evento/${listing.event.publicSlug}`,
    alt: `Foto de ${listing.title}`,
    photo,
  };
}

function imagePart(image: EventCardImage | null): string {
  if (image === null) {
    return 'none';
  }

  return [image.src, image.srcset, image.sizes, String(image.width), String(image.height)].join(
    '\u001f',
  );
}

function photoPart(photo: ListingPagePhoto | null): string {
  if (photo === null) {
    return 'no-photo';
  }

  const large =
    photo.large === null
      ? 'no-large'
      : `${photo.large.src}\u001f${String(photo.large.width)}\u001f${String(photo.large.height)}`;

  return [imagePart(photo.medium), imagePart(photo.thumb), large].join('\u001e');
}

/** Clave del snapshot de la ficha: lo que la ficha pinta y nada más. */
export function listingVersion(listing: PublicListing): string {
  const model = listingPageModel(listing);

  return fnv1a64(
    [
      model.slug,
      model.title,
      model.priceLabel,
      model.soldLabel ?? 'no-sold',
      model.citiesLabel,
      model.measuresLabel ?? 'no-measures',
      model.note ?? 'no-note',
      model.publishedLabel,
      model.eventHref,
      photoPart(model.photo),
    ].join('\u001d'),
  );
}
