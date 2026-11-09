import { expect, type Page } from '@playwright/test';

/**
 * La bienvenida y la captura (corte D13).
 *
 * Desde D13 `/captura` no se abre sin foto: la guarda devuelve a `/inicio`. Un `goto` recarga la
 * página y vacía la sesión de captura, que vive en memoria, así que el arnés entra por la tarjeta de
 * la bienvenida, que es el camino real de la persona.
 */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Toma la primera foto en `/inicio` y espera al panel. */
export async function enterCapture(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/inicio$/);
  await page.setInputFiles('[data-testid="inicio-photo-input"]', {
    name: 'captura.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(page).toHaveURL(/\/captura$/);
}
