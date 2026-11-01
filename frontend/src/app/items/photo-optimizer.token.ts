import { InjectionToken } from '@angular/core';

import { optimizePhoto, type OptimizedPhoto } from './photo-optimizer';

/**
 * Costura del optimizador de fotos (`plan-ciclo-3d` §9).
 *
 * El formulario depende de esta función y no del módulo: una prueba unitaria sustituye el
 * optimizador por un doble determinista —entregar tres `Blob` sin canvas— sin tocar el componente ni
 * la regla de optimización. Es el mismo patrón que el resto de las dependencias del navegador.
 */
export type PhotoOptimizer = (file: File) => Promise<readonly OptimizedPhoto[]>;

export const PHOTO_OPTIMIZER = new InjectionToken<PhotoOptimizer>('PHOTO_OPTIMIZER', {
  providedIn: 'root',
  factory: () => optimizePhoto,
});
