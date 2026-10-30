/**
 * Núcleo puro de la regla de cuenta del ciclo 1.
 *
 * No conoce HTTP, base de datos, reloj ni red (`03` §3): recibe el instante como argumento y
 * devuelve un veredicto. La evidencia del ciclo lo prueba con unit sin base, y los adaptadores de
 * borde se limitan a traducir filas a estas formas.
 *
 * Hechos que implementa, con su fuente:
 * - la invitación dura 72 horas desde su emisión, admite cinco canjes y es revocable; el reclamo con
 *   cuenta la inutiliza (`decisiones` §30);
 * - la sesión es un token opaco por dispositivo, revocable, con alcance `app` o `shop`, y su dueño
 *   es una cuenta o un evento (`modelo-datos` §1 y `decisiones` §22);
 * - el sujeto de una cuenta es el par `(issuer, subject)` de su factor OAuth (`modelo-datos` §1).
 */
import type { SessionScope } from '@mudanzapp/shared';

/** Vigencia del enlace de invitación: 72 horas desde su emisión (`decisiones` §30). */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1_000;

/** Canjes que admite una invitación, contando todos los dispositivos (`decisiones` §30). */
export const INVITATION_MAX_USES = 5;

export interface InvitationState {
  readonly expiresAt: Date;
  readonly useCount: number;
  readonly claimedAt: Date | null;
  readonly revokedAt: Date | null;
}

export type InvitationUnusableReason = 'revoked' | 'claimed' | 'exhausted' | 'expired';

export type InvitationUsability =
  { readonly usable: true } | { readonly usable: false; readonly reason: InvitationUnusableReason };

/**
 * Orden del veredicto: manda el acto del administrador (revocada), después el acto del invitado que
 * cierra el enlace para siempre (reclamada), después el agotamiento por canjes y al final el
 * tiempo. Así la evidencia dice la causa más cercana al acto, no la más lejana.
 */
export function invitationUsability(invitation: InvitationState, now: Date): InvitationUsability {
  if (invitation.revokedAt !== null) {
    return { usable: false, reason: 'revoked' };
  }

  if (invitation.claimedAt !== null) {
    return { usable: false, reason: 'claimed' };
  }

  if (invitation.useCount >= INVITATION_MAX_USES) {
    return { usable: false, reason: 'exhausted' };
  }

  if (now.getTime() >= invitation.expiresAt.getTime()) {
    return { usable: false, reason: 'expired' };
  }

  return { usable: true };
}

/** Instante de vencimiento de una invitación emitida en `now`. */
export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_MS);
}

export interface SessionState {
  readonly revokedAt: Date | null;
}

export type SessionUsability =
  { readonly usable: true } | { readonly usable: false; readonly reason: 'revoked' };

/** Una sesión revocada deja de servir para siempre; no hay vencimiento por tiempo en el ciclo 1. */
export function sessionUsability(session: SessionState): SessionUsability {
  return session.revokedAt === null ? { usable: true } : { usable: false, reason: 'revoked' };
}

/** Dueño de la sesión: una cuenta o un evento, nunca ambos (`modelo-datos` §1). */
export type SessionOwner =
  | { readonly kind: 'account'; readonly userId: string }
  | { readonly kind: 'event'; readonly eventId: string };

/**
 * `null` significa una fila imposible: sin sujeto y sin evento, o con los dos. El borde la trata
 * como sesión inutilizable en vez de adivinar a quién pertenece.
 */
export function sessionOwner(session: {
  readonly userId: string | null;
  readonly eventId: string | null;
}): SessionOwner | null {
  if (session.userId !== null && session.eventId === null) {
    return { kind: 'account', userId: session.userId };
  }

  if (session.userId === null && session.eventId !== null) {
    return { kind: 'event', eventId: session.eventId };
  }

  return null;
}

/** El alcance de la sesión debe cubrir exactamente el recurso que se consume. */
export function sessionCoversScope(sessionScope: SessionScope, required: SessionScope): boolean {
  return sessionScope === required;
}

/**
 * El emisor identifica al proveedor de identidad y es parte de la clave del sujeto. Se normaliza
 * sin barra final para que `https://id.example/` y `https://id.example` no creen dos cuentas.
 */
export function normalizeIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, '');
}
