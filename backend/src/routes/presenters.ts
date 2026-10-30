import type { EventRole, EventSummary, IdentityUser, SessionSummary } from '@mudanzapp/shared';

import type { EventRecord, EventSessionRecord, UserRecord } from '../store/identity-store.js';

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
    originCity: event.originCity,
    destinationCity: event.destinationCity,
    currency: event.currency,
    state: event.state,
    role: event.role,
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
