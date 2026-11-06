import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { PreloadAllModules, provideRouter, withPreloading } from '@angular/router';

import { environment } from '../environments/environment';
import { API_BASE_URL } from './api-base-url.token';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // D4: tras la primera navegación, el router descarga los chunks de los tiles construidos.
    provideRouter(routes, withPreloading(PreloadAllModules)),
    { provide: API_BASE_URL, useValue: environment.apiBaseUrl },
  ],
};
