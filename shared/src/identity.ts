import { z } from 'zod';

/**
 * Contrato del corte de identidad del ciclo 1 (`invite`, `session`, `account-link`).
 *
 * Es el artefacto de las decisiones §21 y §22 de
 * `.plans/decisiones-tecnicas-app-mudanzapp.md`: el token de la invitación y el de la sesión son
 * opacos, los emite el servidor y viajan solo al cliente que los canjea. Aquí vive la **forma** del
 * payload y su validación de frontera; el núcleo de la regla de cuenta vive en
 * `backend/src/domain/account.ts` y no depende de estos esquemas.
 *
 * Marcado como contractual y provisional (`02` §2): el ciclo 1 lo revisa antes de fijarlo.
 */

/** Alcances de sesión declarados por el modelo (`app.session.scope`). */
export const SESSION_SCOPES = ['app', 'shop'] as const;
export type SessionScope = (typeof SESSION_SCOPES)[number];

/** Rol dentro de un evento (`app.event_member.role`). */
export const EVENT_ROLES = ['owner', 'member'] as const;
export type EventRole = (typeof EVENT_ROLES)[number];

export interface IdentityUser {
  readonly id: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
}

export interface EventSummary {
  readonly id: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
  readonly state: string;
  readonly role: EventRole;
}

export interface SessionSummary {
  readonly id: string;
  readonly userId: string;
  readonly userDisplayName: string;
  readonly scope: SessionScope;
  readonly deviceLabel: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
}

/** Sesión emitida a un dispositivo: el token solo se entrega en esta respuesta. */
export interface IssuedSession {
  readonly sessionToken: string;
  readonly scope: SessionScope;
  readonly user: IdentityUser;
  readonly event: EventSummary | null;
}

export interface CreatedEvent {
  readonly event: EventSummary;
}

/** Invitación emitida: el token se muestra una vez y el servidor solo guarda su hash. */
export interface CreatedInvitation {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface CurrentIdentity {
  readonly user: IdentityUser;
  readonly session: {
    readonly id: string;
    readonly scope: SessionScope;
  };
  readonly events: readonly EventSummary[];
}

const oauthToken = z.string().trim().min(1).max(4_096);
const deviceLabel = z.string().trim().min(1).max(80);

/** `POST /auth/redeem`: enlace de un solo uso + cuenta OAuth en el mismo acto. */
export const redeemInvitationSchema = z.object({
  inviteToken: z.string().trim().min(1).max(256),
  oauthToken,
  deviceLabel: deviceLabel.optional(),
});

/** `POST /auth/sessions`: segundo dispositivo con la misma cuenta, sin reusar el enlace. */
export const createSessionSchema = z.object({
  oauthToken,
  deviceLabel: deviceLabel.optional(),
});

/** `POST /admin/events`: un administrador crea el evento de mudanza. */
export const createEventSchema = z.object({
  originCity: z.string().trim().min(1).max(120),
  destinationCity: z.string().trim().min(1).max(120),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/)
    .default('MXN'),
});

export type RedeemInvitationRequest = z.infer<typeof redeemInvitationSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;
export type CreateEventRequest = z.infer<typeof createEventSchema>;
