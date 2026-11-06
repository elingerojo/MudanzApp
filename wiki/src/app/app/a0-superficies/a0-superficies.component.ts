import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile A0: actores y superficies.
 *
 * Responde quién usa el sistema y por dónde entra: las tres superficies, los roles, los puertos de
 * desarrollo y los Workers que las publican. El recorrido de cada actor y el régimen de indexación
 * viven en A2 y A3; aquí solo se declara el mapa.
 */
@Component({
  selector: 'app-a0-superficies',
  imports: [TileHeader, RouterLink],
  templateUrl: './a0-superficies.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class A0SuperficiesComponent {
  protected readonly areas = [
    'frontend/src/app/app.routes.ts',
    'shop/src/app/app.routes.ts',
    'wiki/src/app/app.routes.ts',
    '*/src/app/app.config.ts',
    'shared/src/identity.ts',
    'e2e/support/harness.ts',
    '*/wrangler.jsonc',
  ];

  protected readonly decisions = ['§20', '§22', '§30'];
}
