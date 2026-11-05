import { InjectionToken } from '@angular/core';

import { uploadVariants } from './photo-upload';

/**
 * Costura del transporte de la foto (`plan-ciclo-4g-direct-upload` §8).
 *
 * El formulario depende de esta función y no del módulo: una prueba sustituye las subidas por un
 * doble determinista —sin `XMLHttpRequest` y sin red— sin tocar el componente. Es el mismo patrón que
 * el optimizador: el test afirma qué URL y qué `Blob` salieron, no que el navegador los envió.
 */
export const PHOTO_UPLOADER = new InjectionToken<typeof uploadVariants>('photo-uploader', {
  providedIn: 'root',
  factory: () => uploadVariants,
});
