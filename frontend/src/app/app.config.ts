import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { API_BASE_URL } from './api-base-url.token';
import { routes } from './app.routes';
import { authInterceptor } from './session/auth.interceptor';
import { SessionStore } from './session/session.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // El interceptor es el único que adjunta la credencial, y solo a las peticiones de la API.
    provideHttpClient(withInterceptors([authInterceptor])),
    // La sesión se restaura desde el disco antes de que el router active una ruta con guard; si no,
    // una recarga con credencial se leería como «sin sesión» y mandaría a canjear de nuevo.
    provideAppInitializer(() => inject(SessionStore).restore()),
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
  ],
};
