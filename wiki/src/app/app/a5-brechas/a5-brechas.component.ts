import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile A5: brechas y decisiones abiertas.
 *
 * Es el registro de lo que **no** existe: capacidades aparcadas o tentativas, correcciones de
 * documento pendientes y huecos del propio registro. Nada de esta página es una promesa; cada fila
 * lleva el disparador que la vuelve a mirar.
 */
@Component({
  selector: 'app-a5-brechas',
  imports: [TileHeader, RouterLink],
  templateUrl: './a5-brechas.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class A5BrechasComponent {
  protected readonly areas = [
    '.plans/resumen-funcional-app-mudanzapp.md',
    '.plans/decisiones-tecnicas-app-mudanzapp.md',
    'backend/.env.example',
    'README.md',
  ];

  protected readonly decisions = ['§28', '§29', '§38', '§44'];
}
