import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile E2: alcance y límites.
 *
 * Publica con qué criterio se decide qué se construye: el alcance como hipótesis, el estado de cada
 * capacidad y qué queda fuera. No describe las capacidades —eso es A1–A4— ni repite su detalle: la
 * fuente autoritativa del QUÉ es el resumen funcional.
 */
@Component({
  selector: 'app-e2-alcance',
  imports: [TileHeader, RouterLink],
  templateUrl: './e2-alcance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class E2AlcanceComponent {
  protected readonly areas = [
    '.plans/resumen-funcional-app-mudanzapp.md §4–§6',
    '.guidelines/01-alcance-y-momento-de-decision.md',
    '.roo/rules/01-scope.md',
    '.plans/decisiones-tecnicas-app-mudanzapp.md',
  ];

  protected readonly decisions = ['§28', '§29'];
}
