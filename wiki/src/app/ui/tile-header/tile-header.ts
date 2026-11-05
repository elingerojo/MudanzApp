import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Frescura del tile: `current` cuando sus claims coinciden con el código, `stale` cuando no. */
export type TileStatus = 'current' | 'stale';

/**
 * Cabecera obligatoria de todo tile del registro (contrato de M0).
 *
 * Repite la misma forma en cada página para que un lector pueda saber, sin leer el contenido, qué
 * área describe el tile, cuándo se verificó y de qué decisiones depende. Es presentación pura: no
 * inyecta servicios ni guarda estado.
 */
@Component({
  selector: 'app-tile-header',
  templateUrl: './tile-header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileHeader {
  readonly code = input.required<string>();
  readonly title = input.required<string>();
  readonly route = input.required<string>();
  readonly status = input.required<TileStatus>();
  /** Commit y fecha de la última verificación contra el código. */
  readonly verified = input.required<string>();
  readonly areas = input.required<readonly string[]>();
  readonly decisions = input.required<readonly string[]>();
}
