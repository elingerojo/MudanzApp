/**
 * Punto de entrada del contrato compartido.
 *
 * Es el hub del contrato: tipos por defecto y valores de runtime solo cuando un consumidor los
 * necesita. `zod` vive en `dependencies` y se usa en la frontera del backend; los esquemas del
 * corte de identidad del ciclo 1 se exportan aquí y son la fuente única de su forma.
 */
export { health } from './health.js';
export type { DatabaseState, Health } from './health.js';
export { brand } from './brand.js';
export type { Brand } from './brand.js';
export {
  EVENT_ROLES,
  SESSION_SCOPES,
  createEventSchema,
  createSessionSchema,
  redeemInvitationSchema,
} from './identity.js';
export type {
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
