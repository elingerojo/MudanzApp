import { InjectionToken } from '@angular/core';

/**
 * Costura del flujo de identidad de la tienda (ciclo 4d, `shop-account`).
 *
 * Es hermana de la de `frontend`, pero con un solo propósito: el primer acceso o regreso de un
 * visitante que no toca ningún evento. La composición de PKCE, el descubrimiento y el canje viven en
 * `shared`; aquí solo se fija qué devuelve la vuelta del proveedor.
 */
export interface ShopOAuthCallbackParams {
  readonly code: string | null;
  readonly state: string | null;
  /** El proveedor deniega con `?error=`; es un rechazo explícito, no una visita fallida. */
  readonly error: string | null;
}

export interface ShopOAuthResult {
  readonly idToken: string;
}

export interface ShopOAuthFlow {
  /** Arranca el flujo: guarda el verificador y el `state`, y lleva al proveedor. */
  begin(): Promise<void>;

  /** Completa la vuelta y devuelve el `id_token` que se entrega a `POST /auth/shop/sessions`. */
  complete(params: ShopOAuthCallbackParams): Promise<ShopOAuthResult>;
}

export const SHOP_OAUTH_FLOW = new InjectionToken<ShopOAuthFlow>('SHOP_OAUTH_FLOW');
