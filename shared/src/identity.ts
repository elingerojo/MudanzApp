import { z } from 'zod';

/**
 * Contrato del corte de identidad del ciclo 1 (`invite`, `session`, `account-link`).
 *
 * Es el artefacto de las decisiones §22, §27 y §30 de
 * `.plans/decisiones-tecnicas-app-mudanzapp.md`: el token de la invitación y el de la sesión son
 * opacos, los emite el servidor y viajan solo al cliente que los canjea. Una sesión es **de cuenta**
 * (tiene sujeto) o **de evento** (no lo tiene); el reclamo con cuenta convierte la de evento en la de
 * cuenta.
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

/**
 * `role` es `null` en una sesión de evento: todavía no hay membresía. No es un rol vacío, es la
 * ausencia del hecho, y es lo que el cliente usa para ofrecer el reclamo.
 *
 * Desde el ciclo 4a (`event-index`) el resumen publica `publicSlug`: el enlace del índice existe
 * desde que el evento se crea y el lado privado lo copia sin inventar una ruta (decisión §36).
 */
export interface EventSummary {
  readonly id: string;
  readonly publicSlug: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
  readonly state: string;
  readonly role: EventRole | null;
}

export interface SessionSummary {
  readonly id: string;
  readonly userId: string | null;
  readonly userDisplayName: string | null;
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
  /** `null` en una sesión de evento: documentar no exige identidad (`decisiones` §30). */
  readonly user: IdentityUser | null;
  readonly event: EventSummary | null;
}

export interface CreatedEvent {
  readonly event: EventSummary;
}

/**
 * Invitación emitida: el token se muestra una vez y el servidor solo guarda su hash. `id` es la
 * dirección permanente del enlace; `token` es la capacidad, y muere al agotarse o al reclamarse.
 */
export interface CreatedInvitation {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly maxUses: number;
}

export interface CurrentIdentity {
  readonly user: IdentityUser | null;
  readonly session: {
    readonly id: string;
    readonly scope: SessionScope;
  };
  readonly events: readonly EventSummary[];
}

const oauthToken = z.string().trim().min(1).max(4_096);
const deviceLabel = z.string().trim().min(1).max(80);

/** `POST /auth/redeem`: enlace acotado → sesión de evento, sin identidad. */
export const redeemInvitationSchema = z.object({
  inviteToken: z.string().trim().min(1).max(256),
  deviceLabel: deviceLabel.optional(),
});

/** `POST /auth/claim`: la sesión de evento se convierte en sesión de cuenta. */
export const claimEventSchema = z.object({
  oauthToken,
  deviceLabel: deviceLabel.optional(),
});

/** `POST /auth/sessions`: segundo dispositivo de una cuenta ya reclamada, sin reusar el enlace. */
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
export type ClaimEventRequest = z.infer<typeof claimEventSchema>;
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;
export type CreateEventRequest = z.infer<typeof createEventSchema>;
