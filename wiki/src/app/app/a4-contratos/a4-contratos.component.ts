import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile A4: contratos y datos.
 *
 * Es el tile dueño de los contratos compartidos, del modelo de datos, de los códigos estables y de las
 * costuras de integración. Los demás tiles enlazan aquí en vez de repetir un payload, una tabla o un
 * código.
 */
@Component({
  selector: 'app-a4-contratos',
  imports: [TileHeader, RouterLink],
  templateUrl: './a4-contratos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class A4ContratosComponent {
  protected readonly areas = [
    'shared/src/',
    'backend/sql/',
    'backend/src/errors.ts',
    'backend/src/error-handler.ts',
    'backend/src/config.ts',
    'backend/src/identity/',
    'backend/src/storage/',
    'backend/src/ai/',
  ];

  protected readonly decisions = ['§14.1', '§21', '§26', '§34', '§40'];
}
