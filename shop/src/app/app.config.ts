import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { API_BASE_URL } from './api-base-url.token';
import { routes } from './app.routes';
import { shopAuthInterceptor } from './session/shop-auth.interceptor';
import { provideShopOAuthFlow } from './session/shop-oauth.providers';
import { ShopSessionStore } from './session/shop-session.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // El interceptor es el único que adjunta la credencial de tienda, y solo a la API propia.
    provideHttpClient(withInterceptors([shopAuthInterceptor])),
    // La sesión se restaura desde el disco antes de que el router active una ruta.
    provideAppInitializer(() => inject(ShopSessionStore).restore()),
    // Identidad de tienda (ciclo 4d): el modo `live` o `fake` entra por configuración compilada.
    ...provideShopOAuthFlow(),
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
  ],
};
