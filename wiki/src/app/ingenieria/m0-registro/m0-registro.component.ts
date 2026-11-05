import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile M0: el contrato del registro.
 *
 * Publica las reglas con las que el resto del wiki se escribe y se mantiene: mapa fijo, un dueño por
 * hecho, cabecera de frescura, forma de citar y qué pasa con lo retirado. Es la página que hay que
 * leer antes de escribir o corregir cualquier otro tile.
 */
@Component({
  selector: 'app-m0-registro',
  imports: [TileHeader, RouterLink],
  templateUrl: './m0-registro.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class M0RegistroComponent {
  protected readonly areas = [
    'plans/pre-backfill-plan-wiki.md',
    'wiki/src/app/tiles.ts',
    'wiki/src/app/app.routes.ts',
    'wiki/README.md',
  ];

  protected readonly decisions = ['decisiones §20', 'pre-plan §7 y §14'];
}
