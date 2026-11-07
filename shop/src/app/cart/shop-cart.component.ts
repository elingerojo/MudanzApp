import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatPriceCents, type CartItem } from '@mudanzapp/shared';

import { SHOP_OAUTH_FLOW } from '../session/shop-oauth-flow';
import { shopAccountFailureMessage } from '../session/shop-oauth-message';
import { saveShopReturnTo } from '../session/shop-return-to';
import { ShopSessionStore } from '../session/shop-session.store';
import { ShopCartStore } from './shop-cart.store';

/**
 * El carrito de seleccionados y la solicitud por WhatsApp (ciclo 4e, `cart-request`).
 *
 * Es la página donde el comprador ve lo que guardó, lo quita y lo pide. El carrito es **por evento** y
 * su ruta lleva el `publicSlug`: el enlace del evento es la unidad que se comparte (decisión §36).
 *
 * Sin sesión se puede guardar desde la ficha, pero aquí solo se anuncia la cuenta de lo guardado y se
 * ofrece entrar: la lista con precio y la solicitud exigen una sesión de alcance `shop` (decisión §44).
 * El botón `Pídelos por WhatsApp` se habilita con **dos** hechos: el número del vendedor configurado y
 * el comprador autenticado. Este último es estructural —sin sesión no hay carrito del servidor—, así
 * que la pantalla solo tiene que explicar el primero.
 */
@Component({
  selector: 'app-shop-cart',
  imports: [RouterLink],
  templateUrl: './shop-cart.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopCartComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly session = inject(ShopSessionStore);
  private readonly flow = inject(SHOP_OAUTH_FLOW);

  protected readonly cart = inject(ShopCartStore);
  protected readonly publicSlug = this.route.snapshot.paramMap.get('publicSlug') ?? '';
  protected readonly hasSession = this.session.hasSession;

  protected readonly connecting = signal(false);
  protected readonly error = signal<string | null>(null);

  /** La vuelta al índice del evento: el carrito pertenece a ese enlace y no es un catálogo global. */
  protected readonly eventHref = computed(() => ['/evento', this.publicSlug]);

  constructor() {
    this.cart.open(this.publicSlug);
  }

  /** El precio con la moneda del evento; nulo es «Precio a consultar» (decisión §35). */
  protected priceLabel(item: CartItem): string {
    return formatPriceCents(item.priceCents, this.cart.currency());
  }

  /**
   * El importe agregado de la selección (ciclo B1). Si algún artículo perdió el precio, la misma regla
   * de formato publica «Precio a consultar»: el total no inventa un cero. Si el borde no publicó el
   * campo —un despliegue no atómico— la pantalla lo dice en vez de derivarlo en silencio.
   */
  protected totalLabel(): string {
    return this.cart.totalUnavailable()
      ? 'Total no disponible'
      : formatPriceCents(this.cart.totalCents(), this.cart.currency());
  }

  protected countLabel(): string {
    const count = this.cart.count();
    return count === 1 ? '1 artículo' : `${String(count)} artículos`;
  }

  /**
   * El aviso de despublicación (F3). Nombra el artículo cuando es uno; con varios, dice cuántos. La
   * fila ya se retiró del carrito: el texto explica el hecho, no ofrece una acción sobre ella.
   */
  protected unpublishedLabel(): string {
    const entries = this.cart.unpublished();
    if (entries.length === 1) {
      return `«${entries[0]?.title ?? ''}» fue despublicado por el vendedor y se quitó de tu selección.`;
    }

    return `${String(entries.length)} artículos fueron despublicados por el vendedor y se quitaron de tu selección.`;
  }

  protected dismissUnpublished(): void {
    this.cart.dismissUnpublished();
  }

  protected async remove(slug: string): Promise<void> {
    await this.cart.toggle(slug);
  }

  protected async request(): Promise<void> {
    await this.cart.request();
  }

  protected async cancel(): Promise<void> {
    await this.cart.cancelRequest();
  }

  /** Entrar desde el carrito vuelve al carrito, no a `/cuenta` (extensión de 4d). */
  protected async signIn(): Promise<void> {
    if (this.connecting()) {
      return;
    }

    this.connecting.set(true);
    this.error.set(null);

    try {
      saveShopReturnTo(this.router.url);
      await this.flow.begin();
    } catch (failure: unknown) {
      this.error.set(shopAccountFailureMessage(failure));
    } finally {
      this.connecting.set(false);
    }
  }
}
