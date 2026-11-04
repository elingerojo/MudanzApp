import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { API_BASE_URL } from '../api-base-url.token';
import { ShopSessionStore } from './shop-session.store';

/**
 * Adjunta la credencial de la tienda en `Authorization: Bearer` **solo** a las peticiones del backend
 * propio. La comparación es por origen de la API compilada, no por una lista de rutas.
 */
export const shopAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBaseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const token = inject(ShopSessionStore).token();

  if (token === null || !request.url.startsWith(apiBaseUrl)) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
