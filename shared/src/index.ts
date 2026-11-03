/**
 * Punto de entrada del contrato compartido.
 *
 * Es el hub del contrato: tipos por defecto y valores de runtime solo cuando un consumidor los
 * necesita. `zod` vive en `dependencies` y se usa en la frontera del backend; los esquemas del
 * corte de identidad del ciclo 1 se exportan aquí y son la fuente única de su forma.
 */
export { AI_DRAFT_LIMITS, aiDraftSchema } from './ai.js';
export type { AiDraft, AiDraftResult } from './ai.js';
export { EVENT_CARD_LIMITS, EVENT_CARD_SIZES, cardModel, publishedLabel } from './card.js';
export type { EventCardEntry, EventCardImage, EventCardModel, EventCardThumb } from './card.js';
export {
  EVENT_SLUG_RETRY_SUFFIX_LENGTH,
  EVENT_SLUG_SUFFIX_LENGTH,
  deriveEventPublicSlug,
  eventPublicSlugSchema,
  indexVersion,
  slugBase,
} from './event.js';
export type { PublicEventIndex, PublicEventIndexEvent } from './event.js';
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
  oauthExchangeSchema,
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
export {
  LISTING_LIMITS,
  LISTING_SLUG_PATTERN,
  SOLD_COURTESY_DAYS,
  listingSlugSchema,
  listingState,
  soldCourtesyOver,
} from './listing.js';
export { listingPageModel, listingVersion, measuresLabel } from './listing-page.js';
export {
  OAUTH_SCOPE,
  OAUTH_STATE_BYTES,
  PKCE_VERIFIER_BYTES,
  authorizeUrl,
  base64Url,
  codeChallengeS256,
  createCodeVerifier,
  createOAuthState,
  isPkceVerifier,
  oauthDiscoverySchema,
  oauthStateMatches,
  oauthTokenResponseSchema,
  tokenRequestBody,
} from './pkce.js';
export { PRICE_LIMITS, formatPriceCents, parsePriceInput, priceInputValue } from './price.js';
export type { ListingState } from './listing.js';
export type { ListingPageLarge, ListingPageModel, ListingPagePhoto } from './listing-page.js';
export type {
  AuthorizeUrlInput,
  OAuthDiscovery,
  OAuthTokenResponse,
  RandomSource,
  TokenRequestInput,
} from './pkce.js';
export type { PriceParseResult } from './price.js';
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
  UpdatedItem,
  UpdateItemRequest,
} from './item.js';
export type {
  PublicListing,
  PublicListingPhoto,
  PublicPhotoSize,
  PublishedListing,
} from './listing.js';
export type {
  ClaimEventRequest,
  CreateEventRequest,
  CreateSessionRequest,
  CreatedEvent,
  CreatedInvitation,
  CurrentIdentity,
  EventDashboard,
  EventRole,
  EventSummary,
  IdentityUser,
  IssuedSession,
  OAuthExchange,
  OAuthExchangeRequest,
  RedeemInvitationRequest,
  SessionScope,
  SessionSummary,
} from './identity.js';
