import { z } from 'zod';

/**
 * Contrato de la administración de plataforma (ciclo E1, decisión §46).
 *
 * La credencial es `ADMIN_TOKEN` y no una sesión: el borde la compara en tiempo constante y la
 * superficie la sostiene solo en memoria. Por eso este contrato no publica ningún dato del
 * administrador —no hay sujeto— y publica **sí** el hecho que la pantalla necesita para decidir:
 * qué eventos existen, cuándo se crearon y quién los administra, que es nulo mientras nadie los
 * reclama (decisión §37 y fila E4 del backlog).
 */

/** Página por defecto y techo de la lectura; el techo es del borde, no una costumbre del cliente. */
export const ADMIN_EVENTS_DEFAULT_LIMIT = 20;
export const ADMIN_EVENTS_MAX_LIMIT = 100;

/**
 * Un evento tal como lo ve la plataforma. `publicSlug` siempre tiene valor: el presentador lo deriva
 * cuando la fila es anterior al ciclo 4a, igual que `EventSummary`, para que el enlace nunca quede
 * vacío. `createdAt` es ISO y es también la primera mitad del cursor.
 */
export interface AdminEventSummary {
  readonly id: string;
  readonly publicSlug: string;
  readonly originCity: string;
  readonly destinationCity: string;
  readonly currency: string;
  readonly state: string;
  readonly createdAt: string;
  /** `null` mientras el evento no tiene administrador reclamado. */
  readonly administratorName: string | null;
}

/** Una página de la lista y la llave de la siguiente; `null` es «no hay más». */
export interface AdminEventPage {
  readonly events: readonly AdminEventSummary[];
  readonly nextCursor: string | null;
}

/**
 * `GET /admin/events`. `limit` vacío o fuera de rango y un `cursor` ilegible fallan en la frontera con
 * `validation_failed`: el borde no adivina una página.
 */
export const adminEventsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ADMIN_EVENTS_MAX_LIMIT)
    .default(ADMIN_EVENTS_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(64).optional(),
});

export type AdminEventsQuery = z.infer<typeof adminEventsQuerySchema>;

/** La llave de una página: el último renglón que se publicó. */
export interface AdminEventCursor {
  readonly createdAt: string;
  readonly id: string;
}

const CURSOR_PATTERN = /^([0-9a-z]{1,12})\.([0-9a-f]{32})$/;

/**
 * Cursor opaco para el cliente y determinista para el borde: milisegundos en base 36 y el
 * identificador sin guiones.
 *
 * El cliente nunca lo interpreta —lo repite tal cual—, así que su forma puede cambiar sin romper el
 * contrato. Se evita base64 a propósito: `shared` se compila para navegador y para Node, y este
 * formato no necesita `btoa`, `Buffer` ni una tabla de alfabeto.
 */
export function encodeAdminEventCursor(cursor: AdminEventCursor): string {
  const epochMs = Date.parse(cursor.createdAt);
  if (Number.isNaN(epochMs)) {
    throw new Error('admin-event-cursor-invalid-date');
  }

  return `${epochMs.toString(36)}.${cursor.id.replace(/-/g, '').toLowerCase()}`;
}

/**
 * Cursor leído de la query. Un valor ilegible devuelve `null` y la ruta lo traduce a
 * `validation_failed`; no se ignora en silencio.
 *
 * El instante vuelve truncado a milisegundos, que es como la base lo devolvió al publicarse: el
 * truncamiento solo puede dejar el cursor **antes** de la fila que lo emitió, así que la página
 * siguiente no repite ni salta renglones.
 */
export function decodeAdminEventCursor(raw: string): AdminEventCursor | null {
  const match = CURSOR_PATTERN.exec(raw.trim());
  if (match === null) {
    return null;
  }

  const [, base, hex] = match;
  if (base === undefined || hex === undefined) {
    return null;
  }

  const epochMs = Number.parseInt(base, 36);
  const createdAt = new Date(epochMs);
  if (!Number.isFinite(epochMs) || Number.isNaN(createdAt.getTime())) {
    return null;
  }

  const id = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');

  return { createdAt: createdAt.toISOString(), id };
}
