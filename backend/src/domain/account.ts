/**
 * Núcleo puro de la regla de cuenta del ciclo 1.
 *
 * No conoce HTTP, base de datos, reloj ni red (`03` §3): recibe el instante como argumento y
 * devuelve un veredicto. La evidencia del ciclo lo prueba con unit sin base, y los adaptadores de
 * borde se limitan a traducir filas a estas formas.
 *
 * Hechos que implementa, con su fuente:
 * - la invitación es de un solo uso, dura 7 días y es revocable (§22 de `decisiones`);
 * - la sesión es un token opaco por dispositivo, revocable, con alcance `app` o `shop` (§22 y
 *   `modelo-datos` §1);
 * - el sujeto de una cuenta es el par `(issuer, subject)` de su factor OAuth (`modelo-datos` §1).
 */
import type { SessionScope } from '@mudanzapp/shared';

/** Vigencia del enlace de invitación: 7 días (`resumen-funcional` §4). */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export interface InvitationState {
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
}

export type InvitationUnusableReason = 'revoked' | 'consumed' | 'expired';

export type InvitationUsability =
  { readonly usable: true } | { readonly usable: false; readonly reason: InvitationUnusableReason };

/**
 * Orden del veredicto: revocada manda sobre consumida y vencida, y consumida sobre vencida. Así la
 * evidencia dice la causa más cercana al acto del administrador.
 */
export function invitationUsability(invitation: InvitationState, now: Date): InvitationUsability {
  if (invitation.revokedAt !== null) {
    return { usable: false, reason: 'revoked' };
  }

  if (invitation.consumedAt !== null) {
    return { usable: false, reason: 'consumed' };
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
