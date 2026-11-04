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
 *
 * `label` es el nombre humano del enlace (corte 4c-fix): una palabra del anillo de 20 que decide el
 * servidor y que el cliente solo copia en la URL. No es una credencial ni un estado.
 */
export interface CreatedInvitation {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: string;
  readonly maxUses: number;
  readonly label: string;
}

/**
 * Una invitación tal como el panel la publica (ciclo 4c-3).
 *
 * No lleva `token` —la capacidad se muestra **una sola vez**, al emitirla— ni `token_hash`, que no
 * sale de la base. Tampoco lleva «vencida»: el canje lo decide el borde con su reloj
 * (`invitationUsability`) y publicarlo aquí sería una segunda fuente del mismo hecho con el reloj del
 * navegador.
 */
export interface InvitationSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly useCount: number;
  /** `null` mientras el enlace sigue admitiendo canjes; instante del acto cuando se canceló. */
  readonly revokedAt: string | null;
  /** Nombre humano del enlace; `null` solo en una fila anterior a la migración `012`. */
  readonly label: string | null;
}

export interface CurrentIdentity {
  readonly user: IdentityUser | null;
  readonly session: {
    readonly id: string;
    readonly scope: SessionScope;
  };
  readonly events: readonly EventSummary[];
}

/**
 * El panel del event-administrator (ciclos 4c-2 y 4c-3, decisión §37): **una** lectura para autorizar
 * y para pintar.
 *
 * `administrator` es `null` mientras nadie reclama el evento: el contrato no inventa un nombre ni deja
 * que el cliente deduzca el derecho desde su propia sesión. Los contadores de capturas **no** viajan
 * aquí: salen de la misma lectura de artículos que la sección ya tiene, y duplicarlos sería una segunda
 * fuente del mismo hecho.
 *
 * `devices` son solo co-dispositivos del evento —sesiones sin sujeto—, ordenados del más reciente al
 * más antiguo. Una sesión de cuenta no aparece: su retiro es un acto de membresía, no de sesión. Una
 * sesión des-invitada sigue en la lista con su `revokedAt` escrito, porque ese estado es la evidencia
 * del acto.
 *
 * `invitations` son los enlaces que el evento emitió, incluidos los cancelados y los agotados, del más
 * reciente al más antiguo. Es la pareja del acto `Cancelar enlace`: sin la lista, el rey no sabría qué
 * enlace cancelar.
 */
export interface EventDashboard {
  readonly administrator: IdentityUser | null;
  readonly devices: readonly SessionSummary[];
  readonly invitations: readonly InvitationSummary[];
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

/**
 * `POST /auth/oauth/exchange` (ciclo 4c-1b): el navegador entrega el código y su verificador, y el
 * backend hace el canje que exige secreto. `redirectUri` viaja porque el proveedor exige el mismo que
 * se usó al autorizar y el servidor no conoce el origen del frontend; el proveedor es la autoridad.
 */
export const oauthExchangeSchema = z.object({
  code: z.string().trim().min(1).max(4_096),
  codeVerifier: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9\-._~]{43,128}$/),
  redirectUri: z.url().max(2_048),
});

export type OAuthExchangeRequest = z.infer<typeof oauthExchangeSchema>;

/** Resultado del canje: el `id_token` ya verificado contra el JWKS del emisor. */
export interface OAuthExchange {
  readonly oauthToken: string;
}

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
