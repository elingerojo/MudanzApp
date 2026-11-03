import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { SessionStore } from '../../session/session.store';
import { DashboardStore } from './dashboard.store';

/**
 * Puerta del dashboard del event-administrator (ciclo 4c-2, decisión §37).
 *
 * El derecho **no** se deduce de la sesión: se pregunta al borde, que es el único que sabe quién
 * administra el evento. El guard solo traduce la respuesta.
 *
 * - Sin credencial, el camino es el canje, igual que en [`requireSession`](#) (`/invitacion`).
 * - `forbidden` o `not_found` devuelven a `Capturados` con `denied=dashboard` en la URL: el rechazo es
 *   el hecho que la hipótesis afirma, así que se enseña en vez de esconder la pestaña.
 *
 * Es asíncrono porque la respuesta es una lectura de red; la pantalla reusa el resultado cacheado y no
 * repite la petición.
 */
export const requireEventAdmin: CanActivateFn = async (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const dashboard = inject(DashboardStore);

  if (!session.hasSession()) {
    return router.createUrlTree(['/invitacion']);
  }

  // El hijo no hereda los parámetros del padre (estrategia `emptyOnly`), así que el `eventId` sale del
  // padre o de la propia ruta.
  const eventId = route.parent?.paramMap.get('eventId') ?? route.paramMap.get('eventId') ?? '';
  if (eventId.length === 0) {
    return router.createUrlTree(['/']);
  }

  const result = await dashboard.load(eventId);
  if (result.ok) {
    return true;
  }

  return router.createUrlTree(['/eventos', eventId, 'capturados'], {
    queryParams: { denied: 'dashboard' },
  });
};
