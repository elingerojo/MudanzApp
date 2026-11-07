import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, map, take } from 'rxjs';

import { SessionStore } from './session.store';

/**
 * Puerta de los destinos privados cuando la cuenta tiene varias mudanzas (corte D2).
 *
 * La credencial se restaura de forma síncrona, pero la lista de membresías llega en la lectura de
 * identidad; la guarda **espera** a que esa lectura deje de cargar antes de decidir, igual que la
 * guarda de la administración desde D8. Con dos o más membresías y ninguna elegida, el destino es
 * `/eventos`: la cuenta elige en vez de que la superficie use en silencio la más reciente.
 *
 * Con una sola membresía, o con una elección ya hecha, la guarda no interviene. Sin credencial, el
 * camino sigue siendo el canje (`/invitacion`), como en `requireSession`.
 */
export const requireEventChoice: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);

  if (!session.hasSession()) {
    return router.createUrlTree(['/invitacion']);
  }

  return toObservable(session.identityStatus).pipe(
    filter((status) => status !== 'loading' && status !== 'reloading'),
    take(1),
    map(() => (session.requiresEventChoice() ? router.createUrlTree(['/eventos']) : true)),
  );
};
