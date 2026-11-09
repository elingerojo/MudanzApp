import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ItemFormComponent } from '../items/item-form.component';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { EventContextComponent } from './event-context.component';
import { EventItemsStore } from './event-items.store';

/**
 * Pantalla `Captura` del evento activo (`plan-ciclo-3d` §5 y §6; cortes D8 y D14).
 *
 * Es el host del formulario y no publica ni guarda por sí misma. Desde D14, cuando el formulario
 * termina con éxito —el indicador de progreso ya está en su destello de cierre y la ficha se
 * vació— refresca la lista del evento y navega a `Capturados`, que es donde el artículo recién
 * creado se ve con su estado y su enlace. Un error no emite `saved`, así que la pantalla se queda en
 * `Captura` con su mensaje y, cuando aplica, su reintento de foto.
 */
@Component({
  selector: 'app-capture',
  imports: [EventContextComponent, ItemFormComponent, UiCardComponent],
  templateUrl: './capture.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureComponent {
  private readonly store = inject(EventItemsStore);
  private readonly router = inject(Router);

  protected readonly eventId = this.store.eventId;

  /** El artículo ya existe: el cierre no necesita un segundo toque. */
  protected onSaved(): void {
    this.store.reload();
    void this.router.navigateByUrl('/capturados');
  }
}
