/**
 * Punto de entrada del contrato compartido.
 *
 * Es el hub del contrato: tipos por defecto y valores de runtime solo cuando un consumidor los
 * necesita. `zod` vive en `dependencies` y se usa en la frontera del backend; hoy no se exporta
 * ningún schema porque la frontera todavía no tiene payload que validar.
 */
export { health } from './health.js';
export type { DatabaseState, Health } from './health.js';
export { brand } from './brand.js';
export type { Brand } from './brand.js';
