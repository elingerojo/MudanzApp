import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CART_LIMITS, SOLD_COURTESY_DAYS } from '@mudanzapp/shared';

import { TileHeader } from '../../ui/tile-header/tile-header';

/**
 * Tile A3: catálogo público.
 *
 * Publica la superficie `shop`: el índice del evento, la ficha, la cuenta del visitante, el carrito y
 * el régimen de indexación de cada ruta. Los contratos y las tablas son de A4; el recorrido del
 * vendedor es de A1 y A2.
 */
@Component({
  selector: 'app-a3-catalogo',
  imports: [TileHeader, RouterLink],
  templateUrl: './a3-catalogo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class A3CatalogoComponent {
  protected readonly cartItems = CART_LIMITS.items;
  protected readonly soldCourtesyDays = SOLD_COURTESY_DAYS;

  protected readonly areas = [
    'shop/src/app/',
    'shop/src/worker.ts',
    'shared/src/cart.ts',
    'shared/src/listing.ts',
    'shared/src/event.ts',
    'backend/src/routes/listings-router.ts',
  ];

  protected readonly decisions = ['§26', '§35', '§36', '§40', '§43', '§44'];
}
