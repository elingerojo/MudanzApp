import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ITEM_PHOTO_CONTENT_TYPES } from '@mudanzapp/shared';

import { uiButtonClasses } from '../ui/ui-button/ui-button';
import { UiCardComponent } from '../ui/ui-card/ui-card';
import { EventContextComponent } from './event-context.component';
import { PhotoInboxStore } from './photo-inbox.store';

/**
 * Pantalla de bienvenida de la sesión privada (corte D13).
 *
 * Es el aterrizaje después del canje, de la vuelta del proveedor y de elegir mudanza. Publica la
 * cabecera del evento —título, la instrucción de documentar cada artículo y el enlace público— y un
 * card que pide la primera foto: la captura empieza fuera del panel, no dentro.
 *
 * La foto queda en la sesión de captura y el panel la recibe al montarse; el mismo store permite
 * volver al panel y reutilizarla.
 */
@Component({
  selector: 'app-inicio',
  imports: [EventContextComponent, UiCardComponent],
  templateUrl: './inicio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent {
  private readonly router = inject(Router);
  private readonly inbox = inject(PhotoInboxStore);

  protected readonly accept = ITEM_PHOTO_CONTENT_TYPES.join(',');
  protected readonly primaryClasses = uiButtonClasses('primary');

  /** La foto elegida abre la sesión de captura y el panel la consume al montarse. */
  protected onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const [file] = Array.from(input.files ?? []);
    input.value = '';

    if (file === undefined) {
      return;
    }

    this.inbox.stage(file);
    void this.router.navigateByUrl('/captura');
  }
}
