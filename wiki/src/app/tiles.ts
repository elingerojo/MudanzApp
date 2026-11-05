import type { Type } from '@angular/core';

/**
 * Mapa fijo del registro (tile M0).
 *
 * Esta lista es la **fuente única** de tiles, rutas y disponibilidad: el índice y el router se
 * derivan de aquí, así que un tile nuevo se declara una vez y no hay dos mapas que puedan discrepar.
 *
 * - `code` es el código estable del tile (`M0`, `E1`–`E3`, `A0`–`A5`).
 * - `route` es la ruta pública: `⟨bloque⟩/⟨código⟩-⟨slug⟩`, sin barra inicial.
 * - Un tile sin cargador todavía no existe: el índice lo muestra como pendiente y no lo enlaza.
 */

export type TileBlock = 'ingenieria' | 'app';

export interface Tile {
  readonly code: string;
  readonly block: TileBlock;
  readonly title: string;
  readonly route: string;
  readonly summary: string;
}

export const TILES = [
  {
    code: 'M0',
    block: 'ingenieria',
    title: 'Registro del estado presente',
    route: 'ingenieria/m0-registro',
    summary: 'Qué es un tile, cómo se cita un hecho y cómo se mantiene fresco el registro.',
  },
  {
    code: 'E1',
    block: 'ingenieria',
    title: 'Entorno y dependencias',
    route: 'ingenieria/e1-entorno',
    summary: 'Prohibiciones del monorepo, dependencias aprobadas y reglas de entorno.',
  },
  {
    code: 'E2',
    block: 'ingenieria',
    title: 'Alcance y límites',
    route: 'ingenieria/e2-alcance',
    summary: 'Alcance aprobado, qué queda fuera y qué decisión lo cambia.',
  },
  {
    code: 'E3',
    block: 'ingenieria',
    title: 'Entrega y verificación',
    route: 'ingenieria/e3-entrega',
    summary: 'Gate de verificación, comandos canónicos, matriz de bases y despliegue.',
  },
  {
    code: 'A0',
    block: 'app',
    title: 'Actores y superficies',
    route: 'app/a0-superficies',
    summary: 'Quién usa qué: tres superficies, roles, puertos y Workers.',
  },
  {
    code: 'A1',
    block: 'app',
    title: 'Administración',
    route: 'app/a1-administracion',
    summary: 'Administración de plataforma y de evento, con sus guardas.',
  },
  {
    code: 'A2',
    block: 'app',
    title: 'Cuenta y captura',
    route: 'app/a2-captura',
    summary: 'Recorrido de la cuenta y del co-dispositivo: invitar, capturar, publicar.',
  },
  {
    code: 'A3',
    block: 'app',
    title: 'Catálogo público',
    route: 'app/a3-catalogo',
    summary: 'Índice del evento, ficha pública, cuenta del visitante y carrito.',
  },
  {
    code: 'A4',
    block: 'app',
    title: 'Contratos y datos',
    route: 'app/a4-contratos',
    summary: 'Contratos compartidos, modelo de datos, integraciones y códigos estables.',
  },
  {
    code: 'A5',
    block: 'app',
    title: 'Brechas y decisiones abiertas',
    route: 'app/a5-brechas',
    summary: 'Lo que no existe, lo aparcado y el disparador que lo revisa.',
  },
] as const satisfies readonly Tile[];

export type TileCode = (typeof TILES)[number]['code'];

/**
 * Cargadores de los tiles construidos. La clave es el código del tile; el valor carga la página.
 * Un tile entra al mapa el día que su contenido está verificado, no antes.
 */
export const TILE_LOADERS: Partial<Record<TileCode, () => Promise<Type<unknown>>>> = {
  M0: () =>
    import('./ingenieria/m0-registro/m0-registro.component').then((m) => m.M0RegistroComponent),
  A0: () =>
    import('./app/a0-superficies/a0-superficies.component').then((m) => m.A0SuperficiesComponent),
  E1: () =>
    import('./ingenieria/e1-entorno/e1-entorno.component').then((m) => m.E1EntornoComponent),
};

/** Un tile construido es el que ya tiene cargador: existe como página, no solo como intención. */
export function isTileBuilt(tile: Tile): boolean {
  return TILE_LOADERS[tile.code as TileCode] !== undefined;
}
