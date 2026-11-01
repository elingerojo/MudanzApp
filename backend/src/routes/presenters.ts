import {
  type EventRole,
  type EventSummary,
  type IdentityUser,
  type ItemPhoto,
  type ItemPhotoVariant,
  type ItemSummary,
  type PhotoSize,
  type PublicListing,
  type PublicPhotoSize,
  type SessionSummary,
} from '@mudanzapp/shared';

import type { EventRecord, EventSessionRecord, UserRecord } from '../store/identity-store.js';
import type { ItemWithPhotoRecord, PhotoVariantRecord } from '../store/item-store.js';
import type { ListingWithItemRecord } from '../store/listing-store.js';

/**
 * Traducción fila → contrato. Es el único lugar donde el `snake_case` de la base se convierte en
 * la forma pública; los routers no repiten el mapeo.
 */
export function toIdentityUser(user: UserRecord): IdentityUser {
  return { id: user.id, displayName: user.displayName, isAdmin: user.isAdmin };
}

/**
 * `role` es `null` cuando la sesión es de evento: el hecho "es miembro" todavía no existe, y el
 * contrato no lo inventa (`decisiones` §30).
 */
export function toEventSummary(
  event: EventRecord & { readonly role: EventRole | null },
): EventSummary {
  return {
    id: event.id,
    originCity: event.originCity,
    destinationCity: event.destinationCity,
    currency: event.currency,
    state: event.state,
    role: event.role,
  };
}

export function toSessionSummary(session: EventSessionRecord): SessionSummary {
  return {
    id: session.id,
    userId: session.userId,
    userDisplayName: session.userDisplayName,
    scope: session.scope,
    deviceLabel: session.deviceLabel,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
    revokedAt: session.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Los tres tamaños, con `null` en los que faltan. Un tamaño ausente **no** se inventa: la ficha
 * privada muestra la miniatura y la pública usa la caída heredada, cada una en su superficie.
 */
function sizesOf(
  variants: Partial<Record<ItemPhotoVariant, PhotoSize>> | null,
): Readonly<Record<ItemPhotoVariant, PhotoSize | null>> {
  return {
    thumb: variants?.thumb ?? null,
    medium: variants?.medium ?? null,
    large: variants?.large ?? null,
  };
}

/**
 * La foto de la subida: el mismo `id` estable y los tres tamaños que quedaron en la base. El peso no
 * aparece porque no se persiste (`plan-ciclo-3c-optimizar` §3).
 */
export function toItemPhoto(photoId: string, variants: readonly PhotoVariantRecord[]): ItemPhoto {
  const byVariant = new Map<ItemPhotoVariant, PhotoSize>(
    variants.map((variant) => [
      variant.variant,
      { widthPx: variant.widthPx, heightPx: variant.heightPx },
    ]),
  );

  return {
    id: photoId,
    sizes: {
      thumb: byVariant.get('thumb') ?? null,
      medium: byVariant.get('medium') ?? null,
      large: byVariant.get('large') ?? null,
    },
  };
}

/**
 * El artículo con su foto opcional. `photo` es `null` mientras no se subió: el contrato no inventa
 * una URL ni un objeto vacío, porque en este corte la lectura de la foto exige sesión del evento.
 */
export function toItemSummary(item: ItemWithPhotoRecord): ItemSummary {
  return {
    id: item.id,
    eventId: item.eventId,
    title: item.title,
    note: item.note,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    depthCm: item.depthCm,
    weightKg: item.weightKg,
    photo: item.photoId === null ? null : { id: item.photoId, sizes: sizesOf(item.photoVariants) },
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * La ficha pública (`publish`, ciclo 3c). No expone `eventId`, `itemId` ni `object_key`: la
 * autorización vive en la escritura y el contrato público no publica identificadores internos
 * (`decisiones` §24). La URL de cada tamaño la compone el almacén, no este mapeo, para que la base
 * pública siga siendo una sola fuente (`plan-ciclo-3c` §3).
 *
 * **Caída heredada:** una foto anterior a 3c-optimizar no tiene filas de variante, así que solo se
 * rellena `large` desde la columna heredada, con las dimensiones en `0` porque nadie las declaró. Un
 * tamaño sin dimensiones no reserva caja: inventarla sería peor que no tenerla.
 */
export function toPublicListing(
  listing: ListingWithItemRecord,
  publicUrl: (objectKey: string) => string,
): PublicListing {
  const variants = listing.photoVariants;
  const hasVariants = variants !== null && Object.keys(variants).length > 0;

  const size = (variant: ItemPhotoVariant): PublicPhotoSize | null => {
    const found = variants?.[variant];
    return found === undefined
      ? null
      : {
          url: publicUrl(found.objectKey),
          widthPx: found.widthPx,
          heightPx: found.heightPx,
        };
  };

  const legacy =
    !hasVariants && listing.photoObjectKey !== null
      ? { url: publicUrl(listing.photoObjectKey), widthPx: 0, heightPx: 0 }
      : null;

  const photo =
    legacy === null && !hasVariants
      ? null
      : {
          sizes: {
            thumb: size('thumb'),
            medium: size('medium'),
            large: size('large') ?? legacy,
          },
        };

  return {
    slug: listing.slug,
    title: listing.title,
    note: listing.note,
    widthCm: listing.widthCm,
    heightCm: listing.heightCm,
    depthCm: listing.depthCm,
    weightKg: listing.weightKg,
    photo,
    event: {
      originCity: listing.originCity,
      destinationCity: listing.destinationCity,
    },
    publishedAt: listing.publishedAt.toISOString(),
  };
}
