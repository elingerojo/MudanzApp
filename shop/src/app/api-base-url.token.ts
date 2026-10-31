import { InjectionToken } from '@angular/core';

/**
 * Origen del backend que resuelve el bundler por configuración (`environments/*`).
 * Ningún consumidor lee variables de entorno en runtime.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
