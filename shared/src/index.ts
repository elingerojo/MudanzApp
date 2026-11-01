/**
 * Punto de entrada del contrato compartido.
 *
 * Es el hub del contrato: tipos por defecto y valores de runtime solo cuando un consumidor los
 * necesita. `zod` vive en `dependencies` y se usa en la frontera del backend; los esquemas del
 * corte de identidad del ciclo 1 se exportan aquí y son la fuente única de su forma.
 */
export { AI_DRAFT_LIMITS, aiDraftSchema } from './ai.js';
export type { AiDraft, AiDraftResult } from './ai.js';
export { health } from './health.js';
export type { DatabaseState, Health } from './health.js';
export { brand } from './brand.js';
export type { Brand } from './brand.js';
export {
  EVENT_ROLES,
  SESSION_SCOPES,
  claimEventSchema,
  createEventSchema,
  createSessionSchema,
  redeemInvitationSchema,
} from './identity.js';
export {
  ITEM_LIMITS,
  ITEM_PHOTO_CONTENT_TYPES,
  ITEM_PHOTO_ENCODING,
  ITEM_PHOTO_SIZES,
  ITEM_PHOTO_VARIANTS,
  ITEM_PHOTO_VARIANT_CONTENT_TYPES,
  createItemSchema,
  photoVariantSchema,
  photoVariantUploadSchema,
  updateItemSchema,
} from './item.js';
export { LISTING_LIMITS, LISTING_SLUG_PATTERN, listingSlugSchema } from './listing.js';
export type {
  PublicListing,
  PublicListingPhoto,
  PublicPhotoSize,
  PublishedListing,
} from './listing.js';
export type {
  CreatedItem,
  CreateItemRequest,
  ItemList,
  ItemPhoto,
  ItemPhotoContentType,
  ItemPhotoVariant,
  ItemPhotoVariantContentType,
  ItemSummary,
  PhotoSize,
  PhotoVariantUpload,
  UpdateItemRequest,
} from './item.js';
export type {
  ClaimEventRequest,
  CreateEventRequest,
  CreateSessionRequest,
  CreatedEvent,
  CreatedInvitation,
  CurrentIdentity,
  EventRole,
  EventSummary,
  IdentityUser,
  IssuedSession,
  RedeemInvitationRequest,
  SessionScope,
  SessionSummary,
} from './identity.js';
