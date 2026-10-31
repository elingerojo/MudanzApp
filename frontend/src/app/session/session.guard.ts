import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { SessionStore } from './session.store';

/**
 * Exige sesión para entrar a una sección. Lee la señal de la sesión —única fuente— y manda a un
 * dispositivo sin credencial a la pantalla de canje, que es su única puerta de entrada. Es un guard
 * funcional: la respuesta es síncrona, sin RxJS ni clases.
 */
export const requireSession: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  return session.hasSession() ? true : router.createUrlTree(['/invitacion']);
};
