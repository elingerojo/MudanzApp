import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { PhotoInboxStore } from './photo-inbox.store';

/**
 * Guarda del panel de captura (corte D13).
 *
 * Desde D13 el panel nunca se abre vacío: la foto se toma fuera —en la barra o en la pantalla de
 * bienvenida— y esta guarda exige que exista antes de montar el formulario. Sin foto, la vuelta es la
 * bienvenida, que es donde se empieza.
 */
export const requireCaptureSession: CanActivateFn = () => {
  const inbox = inject(PhotoInboxStore);
  const router = inject(Router);

  return inbox.hasPhoto() ? true : router.createUrlTree(['/inicio']);
};
