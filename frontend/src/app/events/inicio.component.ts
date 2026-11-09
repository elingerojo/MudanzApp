import { ChangeDetectionStrategy, Component } from '@angular/core';

import { UiCardComponent } from '../ui/ui-card/ui-card';
import { EventContextComponent } from './event-context.component';

/**
 * Pantalla de bienvenida de la sesión privada (cortes D13 y D14).
 *
 * Es el aterrizaje después del canje, de la vuelta del proveedor y de elegir mudanza. Publica la
 * cabecera del evento —título, la instrucción de documentar cada artículo y el enlace público— y un
 * card que pide la primera foto y nombra el botón central `Foto` de la barra.
 *
 * Desde D14 esta pantalla **no** monta su propia cámara: el único control que toma la foto es el
 * botón `Foto` de la barra, que deja el archivo en la sesión de captura y abre el panel.
 */
@Component({
  selector: 'app-inicio',
  imports: [EventContextComponent, UiCardComponent],
  templateUrl: './inicio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InicioComponent {}
