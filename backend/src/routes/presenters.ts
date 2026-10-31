import type {
  EventRole,
  EventSummary,
  IdentityUser,
  ItemSummary,
  PublicListing,
  SessionSummary,
} from '@mudanzapp/shared';

import type { EventRecord, EventSessionRecord, UserRecord } from '../store/identity-store.js';
import type { ItemWithPhotoRecord } from '../store/item-store.js';
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
 * El artículo con su foto opcional. `photo` es `null` mientras no se subió: el contrato no inventa
 * una URL ni un objeto vacío, porque en este corte la lectura de la foto exige sesión del evento.
 */
export function toItemSummary(item: ItemWithPhotoRecord): ItemSummary {
  const photo =
    item.photoId === null || item.photoContentType === null || item.photoByteSize === null
      ? null
      : {
          id: item.photoId,
          contentType: item.photoContentType,
          byteSize: item.photoByteSize,
        };

  return {
    id: item.id,
    eventId: item.eventId,
    title: item.title,
    note: item.note,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    depthCm: item.depthCm,
    weightKg: item.weightKg,
    photo,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * La ficha pública (`publish`, ciclo 3c). No expone `eventId`, `itemId` ni `object_key`: la
 * autorización vive en la escritura y el contrato público no publica identificadores internos
 * (`decisiones` §24). La URL de la foto la compone el almacén, no este mapeo, para que la base
 * pública siga siendo una sola fuente (`plan-ciclo-3c` §3).
 */
export function toPublicListing(
  listing: ListingWithItemRecord,
  publicUrl: (objectKey: string) => string,
): PublicListing {
  const photo =
    listing.photoObjectKey === null || listing.photoContentType === null
      ? null
      : { url: publicUrl(listing.photoObjectKey), contentType: listing.photoContentType };

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
