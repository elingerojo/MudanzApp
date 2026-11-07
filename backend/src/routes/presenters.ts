import {
  cartRequestAvailableTotal,
  cartRequestHasChanges,
  cartRequestMessage,
  cartRequestReference,
  cartTotal,
  deriveEventPublicSlug,
  indexVersion,
  listingVersion,
  whatsappRequestUrl,
  type AdminEventSummary,
  type BuyerCartRequest,
  type CartRequestSummary,
  type EventCardEntry,
  type EventRole,
  type EventSummary,
  type IdentityUser,
  type InvitationSummary,
  type ItemPhoto,
  type ItemPhotoVariant,
  type ItemSummary,
  type OpenCartRequest,
  type PhotoSize,
  type PublicCart,
  type PublicEventIndex,
  type PublicListing,
  type PublicPhotoSize,
  type SessionSummary,
} from '@mudanzapp/shared';

import type { CartRequestRecord, CartRow, OpenCartRequestRecord } from '../store/cart-store.js';
import type {
  EventInvitationRecord,
  EventRecord,
  EventSessionRecord,
  PlatformEventRecord,
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

/**
 * El evento en la lista de plataforma (ciclo E1). Publica la fecha de creación —es la llave de la
 * página siguiente— y el nombre de quien lo administra, nulo mientras nadie lo reclama.
 *
 * `publicSlug` se deriva cuando la fila es anterior al ciclo 4a, igual que en `toEventSummary`: un
 * evento sin identificador persistido no deja el enlace vacío.
 */
export function toAdminEventSummary(event: PlatformEventRecord): AdminEventSummary {
  return {
    id: event.id,
    publicSlug:
      event.publicSlug ?? deriveEventPublicSlug(event.originCity, event.destinationCity, event.id),
    originCity: event.originCity,
    destinationCity: event.destinationCity,
    currency: event.currency,
    state: event.state,
    createdAt: event.createdAt.toISOString(),
    administratorName: event.administratorName,
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
    unpublishedAt: item.unpublishedAt?.toISOString() ?? null,
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

/**
 * El carrito del comprador (ciclo 4e). Publica sus artículos, la moneda con la que se leen sus precios,
 * si el evento tiene WhatsApp configurado y su solicitud abierta.
 *
 * `whatsappAvailable` es un hecho del evento, no del visitante: el número en sí **no** cruza este
 * contrato, solo el enlace compuesto cuando la solicitud existe. `reference` se deriva del `id` y no se
 * guarda: es la forma legible de la misma fila.
 *
 * Desde F3 las filas despublicadas no entran en `items`: se publican aparte en `unpublished`, con su
 * título, para que la pantalla explique el retiro antes de que el `PUT` las borre de la tabla.
 */
export function toPublicCart(
  event: PublicEventRecord,
  cart: CartRow | null,
  request: OpenCartRequestRecord | null,
): PublicCart {
  const rows = cart?.items ?? [];
  const items = rows
    .filter((item) => item.unpublishedAt === null)
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      priceCents: item.priceCents,
      soldAt: item.soldAt?.toISOString() ?? null,
      addedAt: item.addedAt.toISOString(),
    }));

  return {
    event: {
      publicSlug:
        event.publicSlug ??
        deriveEventPublicSlug(event.originCity, event.destinationCity, event.id),
      currency: event.currency,
    },
    items,
    unpublished: rows
      .filter((item) => item.unpublishedAt !== null)
      .map((item) => ({ slug: item.slug, title: item.title })),
    // B1: el importe se deriva de los artículos visibles; no se guarda ni se inventa un cero cuando
    // alguno perdió el precio.
    totalCents: cartTotal(items),
    whatsappAvailable: event.contactPhone !== null,
    request: request === null ? null : toBuyerCartRequest(request, event.contactPhone),
  };
}

/**
 * La solicitud abierta con su referencia y el enlace que el comprador ya puede reabrir tras recargar
 * (ciclo 4e). El teléfono **no** se publica como campo: solo se compone dentro del enlace.
 *
 * Desde B9 es la base de `toBuyerCartRequest`, que añade el registro.
 */
export function toOpenCartRequest(
  request: OpenCartRequestRecord,
  contactPhone: string | null,
): OpenCartRequest {
  const reference = cartRequestReference(request.id);

  return {
    id: request.id,
    reference,
    requestedAt: request.requestedAt.toISOString(),
    whatsappUrl:
      contactPhone === null
        ? null
        : whatsappRequestUrl(contactPhone, cartRequestMessage(reference)),
  };
}

/**
 * La solicitud abierta con su registro (ciclo B9): la misma referencia y el mismo enlace de 4e, más la
 * instantánea con el estado derivado de cada artículo y el importe vigente.
 *
 * `totalCents` **no** es el importe congelado del panel: es lo que el comprador pagaría hoy, con los
 * artículos despublicados, vendidos o eliminados en `0` y un `price_changed` a su precio actual.
 * `hasChanges` usa la misma función pura que el panel, así que los dos lectores no pueden discrepar.
 */
export function toBuyerCartRequest(
  request: OpenCartRequestRecord,
  contactPhone: string | null,
): BuyerCartRequest {
  return {
    ...toOpenCartRequest(request, contactPhone),
    items: request.items,
    totalCents: cartRequestAvailableTotal(request.items),
    hasChanges: cartRequestHasChanges(request.items),
  };
}

/**
 * Una solicitud del dashboard (ciclo 4e). Publica la instantánea del momento de pedir —no el carrito
 * de hoy— y el nombre de la cuenta; ni el `cart_id` ni el sujeto de la sesión cruzan el contrato.
 *
 * B8: `state` y `currentPriceCents` vienen de la lectura; `hasChanges` es la única agregación y se
 * deriva aquí, de los mismos `items`, en vez de repetirla en el SQL.
 */
export function toCartRequestSummary(record: CartRequestRecord): CartRequestSummary {
  const items = record.items.map((item) => ({
    title: item.title,
    priceCents: item.priceCents,
    state: item.state,
    currentPriceCents: item.currentPriceCents,
  }));

  return {
    id: record.id,
    reference: cartRequestReference(record.id),
    buyerName: record.buyerName,
    itemCount: items.length,
    items,
    hasChanges: cartRequestHasChanges(items),
    // B1: la instantánea guarda `price_cents_snapshot NOT NULL`, así que la suma siempre existe. El
    // `?? 0` solo satisface el tipo de `cartTotal`; no hay un caso real de precio nulo aquí.
    totalCents: cartTotal(record.items) ?? 0,
    requestedAt: record.requestedAt.toISOString(),
    dismissedAt: record.dismissedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
  };
}
