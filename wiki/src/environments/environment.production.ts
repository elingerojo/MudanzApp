/**
 * Producción: el valor se compila dentro del bundle y `fileReplacements` lo intercambia solo en
 * la configuración `production`.
 *
 * `⟨BACKEND_HOST⟩` sigue pendiente (manual `Man-3.4`, sin barra final). Se deja el marcador
 * literal a propósito: un valor inventado apuntaría a un host inexistente sin avisar.
 */
export const environment = { apiBaseUrl: '⟨BACKEND_HOST⟩' };
