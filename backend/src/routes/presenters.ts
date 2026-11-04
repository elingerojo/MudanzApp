import {
  type EventCardEntry,
  type EventRole,
  type EventSummary,
  type IdentityUser,
  type InvitationSummary,
  type ItemPhoto,
  type ItemPhotoVariant,
  type ItemSummary,
  type PhotoSize,
  type PublicEventIndex,
  type PublicListing,
  type PublicPhotoSize,
  type SessionSummary,
  deriveEventPublicSlug,
  indexVersion,
  listingVersion,
} from '@mudanzapp/shared';

import type {
  EventInvitationRecord,
  EventRecord,
  EventSessionRecord,
  UserRecord,
} from '../store/identity-store.js';
import type { ItemWithPhotoRecord, PhotoVariantRecord } from '../store/item-store.js';
import type {
  ListingWithItemRecord,
  PublicEventListingRecord,
  PublicEventRecord,
} from '../store/listing-store.js';

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
    // Un evento anterior al ciclo 4a se deriva aquí sin escribir: la derivación es determinista sobre
    // el identificador y el enlace queda estable aunque la persistencia llegue después.
    publicSlug:
      event.publicSlug ?? deriveEventPublicSlug(event.originCity, event.destinationCity, event.id),
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
 * El enlace cancelable del panel (ciclo 4c-3). El presentador no compone estado: publica lo que la
 * fila dice, y `revokedAt` nulo es «sigue admitiendo canjes». Ni el token ni su hash cruzan aquí.
 */
export function toInvitationSummary(invitation: EventInvitationRecord): InvitationSummary {
  return {
    id: invitation.id,
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    useCount: invitation.useCount,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    label: invitation.label,
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
 *
 * `publishedSlug` viene de `app.listing` y no de la memoria de la visita: es lo que permite que la
 * pestaña `Capturados` distinga `en proceso` de `publicado` después de recargar (`plan-ciclo-3d` §5).
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
    priceCents: item.priceCents,
    soldAt: item.soldAt?.toISOString() ?? null,
    photo: item.photoId === null ? null : { id: item.photoId, sizes: sizesOf(item.photoVariants) },
    publishedSlug: item.publishedSlug,
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

  const draft: PublicListing = {
    version: '',
    slug: listing.slug,
    title: listing.title,
    note: listing.note,
    widthCm: listing.widthCm,
    heightCm: listing.heightCm,
    depthCm: listing.depthCm,
    weightKg: listing.weightKg,
    priceCents: listing.priceCents,
    soldAt: listing.soldAt?.toISOString() ?? null,
    photo,
    event: {
      originCity: listing.originCity,
      destinationCity: listing.destinationCity,
      publicSlug:
        listing.publicSlug ??
        deriveEventPublicSlug(listing.originCity, listing.destinationCity, listing.eventId),
      currency: listing.currency,
    },
    publishedAt: listing.publishedAt.toISOString(),
  };

  return { ...draft, version: listingVersion(draft) };
}

/**
 * Una tarjeta del índice público (ciclo 4a). Solo publica lo que la tarjeta pinta: `slug`, `title`,
 * `publishedAt` y la miniatura. Ni `eventId`, ni `itemId`, ni el `object_key` (`decisiones` §24).
 *
 * La URL de la miniatura la compone el almacén, no este mapeo, para que la base pública siga siendo
 * una sola fuente (decisión §26).
 */
export function toPublicListingCard(
  listing: PublicEventListingRecord,
  publicUrl: (objectKey: string) => string,
): EventCardEntry {
  const thumb =
    listing.thumbObjectKey === null ||
    listing.thumbWidthPx === null ||
    listing.thumbHeightPx === null
      ? null
      : {
          url: publicUrl(listing.thumbObjectKey),
          widthPx: listing.thumbWidthPx,
          heightPx: listing.thumbHeightPx,
        };

  return {
    slug: listing.slug,
    title: listing.title,
    priceCents: listing.priceCents,
    publishedAt: listing.publishedAt.toISOString(),
    thumb,
  };
}

/**
 * El índice completo, con su clave de versión. La versión se calcula con `indexVersion` sobre las
 * mismas tarjetas que se publican, así que el snapshot y el JSON no pueden describir estados
 * distintos en la misma respuesta.
 */
export function toPublicEventIndex(
  event: PublicEventRecord,
  listings: readonly EventCardEntry[],
): PublicEventIndex {
  return {
    version: indexVersion({ event, listings }),
    event: {
      publicSlug:
        event.publicSlug ??
        deriveEventPublicSlug(event.originCity, event.destinationCity, event.id),
      originCity: event.originCity,
      destinationCity: event.destinationCity,
      currency: event.currency,
    },
    listings,
  };
}
