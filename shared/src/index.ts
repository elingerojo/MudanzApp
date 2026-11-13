/**
 * Punto de entrada del contrato compartido.
 *
 * Es el hub del contrato: tipos por defecto y valores de runtime solo cuando un consumidor los
 * necesita. `zod` vive en `dependencies` y se usa en la frontera del backend; los esquemas del
 * corte de identidad del ciclo 1 se exportan aquí y son la fuente única de su forma.
 */
export {
  ADMIN_EVENTS_DEFAULT_LIMIT,
  ADMIN_EVENTS_MAX_LIMIT,
  adminEventsQuerySchema,
  decodeAdminEventCursor,
  encodeAdminEventCursor,
} from './admin.js';
export type {
  AdminEventCursor,
  AdminEventPage,
  AdminEventSummary,
  AdminEventsQuery,
} from './admin.js';
export { AI_DRAFT_LIMITS, aiDraftSchema } from './ai.js';
export type { AiDraft, AiDraftResult } from './ai.js';
export {
  PHOTO_BUNDLE_CONTENT_TYPE,
  PHOTO_BUNDLE_HEADER_BYTES,
  PhotoBundleError,
  decodePhotoBundle,
  encodePhotoBundle,
} from './photo-bundle.js';
export type { PhotoBundleErrorCode, PhotoBundlePart, PhotoBundlePhoto } from './photo-bundle.js';
export {
  CAPTURE_KEY_SEGMENT,
  CAPTURE_LIMITS,
  attachPhotosSchema,
  captureKeyPrefix,
  captureObjectKey,
  captureTicketRequestSchema,
  photoOrderSchema,
} from './capture.js';
export type {
  AttachPhotosRequest,
  AttachedPhotos,
  CaptureAttach,
  CaptureTicket,
  CaptureTicketRequest,
  CaptureUploadUrl,
  CaptureVariantDims,
  PhotoOrderRequest,
} from './capture.js';
export { EVENT_CARD_LIMITS, EVENT_CARD_SIZES, cardModel, publishedLabel } from './card.js';
export type { EventCardEntry, EventCardImage, EventCardModel, EventCardThumb } from './card.js';
export {
  CART_LIMITS,
  WHATSAPP_NUMBER_PATTERN,
  cartPutSchema,
  cartRequestAvailableTotal,
  cartRequestHasChanges,
  cartRequestItemAmount,
  cartRequestMessage,
  cartRequestReference,
  cartTotal,
  eventContactSchema,
  normalizeWhatsappNumber,
  parseContactPhone,
  whatsappRequestUrl,
} from './cart.js';
export type {
  BuyerCartRequest,
  CartItem,
  CartPutRequest,
  CartRequestItem,
  CartRequestItemState,
  CartRequestSummary,
  CartWriteResult,
  ContactPhoneParse,
  EventContact,
  EventContactRequest,
  IssuedCartRequest,
  OpenCartRequest,
  PublicCart,
  UnpublishedCartItem,
} from './cart.js';
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
  DEVICE_LABEL_MAX,
  EVENT_ROLES,
  SESSION_SCOPES,
  claimEventSchema,
  createEventSchema,
  createSessionSchema,
  oauthExchangeSchema,
  redeemInvitationSchema,
  shopSessionSchema,
  updateShopProfileSchema,
} from './identity.js';
export {
  ONBOARDING_LEVELS,
  ONBOARDING_MAX_LEVEL,
  onboardingLevelCopy,
  onboardingLevelFor,
  onboardingLevelSchema,
  orderControlsVisible,
  photosForLevel,
  promotionFor,
} from './onboarding.js';
export type {
  OnboardingEvidence,
  OnboardingLevel,
  OnboardingLevelDefinition,
  OnboardingLevelRequest,
  OnboardingLevelResponse,
  OnboardingPromotion,
  PromotionEmphasis,
} from './onboarding.js';
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
export {
  discoverOAuth,
  exchangeAuthorizationCode,
  oauthConfigured,
  oauthRedirectUri,
} from './oauth-client.js';
export type {
  CodeExchangeInput,
  FetchInitLike,
  FetchLike,
  FetchResponseLike,
  OAuthClientConfig,
  OAuthClientFailure,
  OAuthClientMode,
  OAuthClientResult,
} from './oauth-client.js';
export { OAuthFlowError } from './oauth-flow-error.js';
export type { OAuthFlowErrorCode } from './oauth-flow-error.js';
export { createPendingFlowStore } from './oauth-pending.js';
export type {
  OAuthPendingPurpose,
  PendingFlowKeys,
  PendingFlowStore,
  PendingOAuthFlow,
  StorageLike,
} from './oauth-pending.js';
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
  InvitationSummary,
  IssuedSession,
  OAuthExchange,
  OAuthExchangeRequest,
  RedeemInvitationRequest,
  SessionScope,
  SessionSummary,
  ShopIdentity,
  UpdateShopProfileRequest,
} from './identity.js';
