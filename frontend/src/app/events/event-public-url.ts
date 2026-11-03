/**
 * El enlace público del índice de un evento (decisión §36).
 *
 * El origen de `shop` es configuración compilada y el `publicSlug` lo emite el backend: el frontend no
 * compone ninguno de los dos, solo los une. Vive aquí y no en cada pantalla porque el marco del evento
 * y el panel del event-administrator publican el mismo enlace, y dos composiciones del mismo hecho
 * acaban discrepando.
 */
export function eventPublicUrl(publicSlug: string, shopBaseUrl: string): string {
  return `${shopBaseUrl}/evento/${publicSlug}`;
}
