import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Contenedor de sección con título opcional. Solo presentación: agrupa contenido y le da el mismo
 * borde y espaciado en todas las pantallas.
 */
@Component({
  selector: 'app-ui-card',
  templateUrl: './ui-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCardComponent {
  readonly title = input<string | null>(null);
}
