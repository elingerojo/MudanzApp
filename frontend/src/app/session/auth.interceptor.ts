import type { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { API_BASE_URL } from '../api-base-url.token';
import { SessionStore } from './session.store';

/**
 * Adjunta la credencial en `Authorization: Bearer` **solo** a las peticiones del backend propio.
 *
 * La comparación es por origen de la API compilada, no por `http://` o por una lista de rutas: una
 * petición a otro origen —una imagen de terceros, un enlace compartido— nunca lleva el token.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const apiBaseUrl = inject(API_BASE_URL).replace(/\/+$/, '');
  const token = inject(SessionStore).token();

  if (token === null || !request.url.startsWith(apiBaseUrl)) {
    return next(request);
  }

  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
