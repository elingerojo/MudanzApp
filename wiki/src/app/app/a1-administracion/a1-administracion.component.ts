import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile A1: administración.
 *
 * Publica los dos niveles de administración —plataforma y evento—, la frontera que comparten sus
 * actos y los tres actos del panel con su efecto. El recorrido de invitación y captura es de A2; el
 * carrito y el catálogo, de A3.
 */
@Component({
  selector: 'app-a1-administracion',
  imports: [TileHeader, RouterLink],
  templateUrl: './a1-administracion.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class A1AdministracionComponent {
  protected readonly areas = [
    'backend/src/routes/admin-router.ts',
    'backend/src/routes/event-administration.ts',
    'backend/src/routes/events-router.ts',
    'backend/src/routes/items-router.ts',
    'frontend/src/app/events/dashboard/',
    'frontend/src/app/platform-admin/',
    'shared/src/admin.ts',
  ];

  protected readonly decisions = ['§37', '§40', '§42', '§44', '§46'];
}
