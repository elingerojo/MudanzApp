import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

import { type DashboardDenial } from '../session/api-error';

/**
 * El aviso que traduce el rechazo de la administración del evento (cortes D8 y D10).
 *
 * La guarda devuelve a `Cuenta` con la familia del fallo en la URL. Antes el aviso vivía en el marco
 * del evento; desde D10 la pantalla a la que la guarda devuelve —la Cuenta— es su dueña.
 *
 * La familia viaja en la URL y no en un estado del store: recargar la conserva y navegar a otra
 * pantalla la borra. Se relee en cada navegación porque la pantalla puede reusarse.
 */
@Component({
  selector: 'app-dashboard-denial',
  templateUrl: './dashboard-denial.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardDenialComponent {
  private readonly router = inject(Router);

  protected readonly reason = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.deniedFromCurrentUrl()),
    ),
    { initialValue: this.deniedFromCurrentUrl() },
  );

  /** `null` significa que no hay aviso; una URL anterior al diagnóstico se lee como rechazo. */
  private deniedFromCurrentUrl(): DashboardDenial | null {
    const params = this.router.parseUrl(this.router.url).queryParams;
    if (params['denied'] !== 'dashboard') {
      return null;
    }

    const reason: unknown = params['reason'];
    return reason === 'not_found' || reason === 'unavailable' ? reason : 'forbidden';
  }
}
