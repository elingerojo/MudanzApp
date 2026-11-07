import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanActivateFn } from '@angular/router';
import { filter, switchMap, take } from 'rxjs';

import { dashboardDenial } from '../../session/api-error';
import { SessionStore } from '../../session/session.store';
import { DashboardStore } from './dashboard.store';

/**
 * Puerta de la administración del evento (ciclo 4c-2, decisión §37; cortes D8 y D10).
 *
 * El derecho **no** se deduce de la sesión: se pregunta al borde, que es el único que sabe quién
 * administra el evento. El guard solo traduce la respuesta.
 *
 * Desde D8 el evento no está en la URL. La credencial se restaura de forma síncrona, pero el evento
 * activo llega en la lectura de identidad, así que la guarda **espera** a que esa lectura deje de
 * cargar antes de decidir. Sin evento, el camino de vuelta es la portada.
 *
 * - Sin credencial, el camino es el canje, igual que en `requireSession` (`/invitacion`).
 * - Un fallo devuelve a `Cuenta` con `denied=dashboard` y la familia del fallo en la URL: desde D10
 *   la Cuenta es la dueña de la administración y la que enseña el rechazo (antes era `Capturados`).
 * - `forbidden`, `not_found` o `unavailable` distinguen «el borde dijo que no» de «no lo alcanzo» de
 *   «la lectura falló» (diagnóstico del borde, 2026-11-04).
 */
export const requireEventAdmin: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const dashboard = inject(DashboardStore);

  if (!session.hasSession()) {
    return router.createUrlTree(['/invitacion']);
  }

  return toObservable(session.identityStatus).pipe(
    filter((status) => status !== 'loading' && status !== 'reloading'),
    take(1),
    switchMap(async () => {
      const eventId = session.activeEventId();
      if (eventId === null) {
        return router.createUrlTree(['/']);
      }

      const result = await dashboard.load(eventId);
      if (result.ok) {
        return true;
      }

      return router.createUrlTree(['/cuenta'], {
        queryParams: { denied: 'dashboard', reason: dashboardDenial(result.code) },
      });
    }),
  );
};
