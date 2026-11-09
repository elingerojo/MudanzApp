import { expect, type Page } from '@playwright/test';

/**
 * La bienvenida y la captura (cortes D13 y D14).
 *
 * Desde D13 `/captura` no se abre sin foto: la guarda devuelve a `/inicio`. Desde D14 la bienvenida
 * no monta cámara propia, así que el arnés usa el input oculto de la shell, el mismo que abre el
 * botón central `Foto`. Un `goto` recarga la página y vacía la sesión de captura, que vive en
 * memoria, así que el arnés entra desde una pantalla privada ya montada, que es el camino real.
 */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Toma la primera foto desde el input de la barra y espera al panel. */
export async function enterCapture(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/inicio$/);
  await page.setInputFiles('[data-testid="shell-photo-input"]', {
    name: 'captura.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  });
  await expect(page).toHaveURL(/\/captura$/);
}
