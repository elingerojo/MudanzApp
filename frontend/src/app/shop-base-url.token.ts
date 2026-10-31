import { InjectionToken } from '@angular/core';

/**
 * Origen de la superficie pública (`shop`), resuelto por el bundler desde `environments/*`.
 *
 * Es lo único que este frontend necesita saber del otro Worker: `publish` compone el enlace que se
 * copia como `shopBaseUrl + '/' + slug`, y el `slug` lo devuelve el backend. Si el Worker de `shop`
 * cambia de nombre, se reconstruye `frontend`; el origen no se lee en runtime.
 */
export const SHOP_BASE_URL = new InjectionToken<string>('SHOP_BASE_URL');
