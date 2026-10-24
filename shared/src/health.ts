/**
 * Contrato de estado del backend.
 *
 * `Health` es la forma del payload que sirven `/health` y `/health/db`, y el tipo que consume el
 * frontend en `httpResource<Health>`. La forma se declara aquí y no se duplica en ningún consumidor.
 */

/** Estado de la base de datos, tal como lo reporta el adaptador de `db.ts`. */
export type DatabaseState = 'ok' | 'error' | 'not-configured';

/** Payload de estado: liveness (`status`) y estado del dependiente (`database`). */
export interface Health {
  readonly status: 'ok' | 'degraded';
  readonly database: DatabaseState;
}

/**
 * Deriva el payload de readiness a partir del estado de la base.
 *
 * Regla del humo: `ok` solo si la base responde; en cualquier otro estado el proceso está
 * `degraded` y `/health/db` responde 503. La liveness (`/health`) nunca degrada: usa
 * `status: 'ok'` con este mismo `database` en el payload, porque una base caída no debe
 * reiniciar un proceso sano.
 */
export function health(database: DatabaseState): Health {
  return { status: database === 'ok' ? 'ok' : 'degraded', database };
}
