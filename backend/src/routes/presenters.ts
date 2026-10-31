import type {
  EventRole,
  EventSummary,
  IdentityUser,
  ItemSummary,
  SessionSummary,
} from '@mudanzapp/shared';

import type { EventRecord, EventSessionRecord, UserRecord } from '../store/identity-store.js';
import type { ItemWithPhotoRecord } from '../store/item-store.js';

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
