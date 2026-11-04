import type { Queryable } from '../db.js';
import { canActOnEvent, canAdministerEvent } from '../domain/account.js';
import { AppError } from '../errors.js';
import {
  findEventForUser,
  readEventAdministrator,
  type EventAdministratorRecord,
} from '../store/identity-store.js';
import type { RequestIdentity } from './session.js';

/**
 * La frontera de administración de un evento (ciclo 4c-2, decisión §37), en un solo lugar.
 *
 * El orden no se invierte: primero se resuelve si la sesión **alcanza** el evento —una sesión ajena o
 * inexistente responde `not_found`— y solo después si su sujeto lo **administra** —un miembro o un
 * co-dispositivo responde `forbidden`—. La diferencia importa: su evento ya es visible para un
 * co-dispositivo, así que negarlo con `not_found` sería mentirle y borraría la evidencia del rechazo.
 *
 * Nació dentro de `events-router` con su primer escritor; desde 4c-4 el borrado de una captura ejerce
 * el mismo derecho, así que se extrajo en vez de duplicar la regla.
 */
export async function requireEventAdministrator(
  database: Queryable,
  identity: RequestIdentity,
  eventId: string,
): Promise<EventAdministratorRecord> {
  const administrator = await readEventAdministrator(database, eventId);
  if (administrator === null) {
    throw new AppError('not_found');
  }

  const isMember =
    identity.user === null
      ? false
      : (await findEventForUser(database, eventId, identity.user.id)) !== null;

  if (
    !canActOnEvent(
      { eventId: identity.eventId, userId: identity.user?.id ?? null },
      eventId,
      isMember,
    )
  ) {
    throw new AppError('not_found');
  }

  if (
    !canAdministerEvent(
      { userId: identity.user?.id ?? null, isAdmin: identity.user?.isAdmin ?? false },
      administrator.adminUserId,
    )
  ) {
    throw new AppError('forbidden');
  }

  return administrator;
}
