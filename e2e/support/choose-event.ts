import { expect, type Page } from '@playwright/test';

/**
 * El selector de mudanza (corte D2) en el arnés.
 *
 * El verificador `fake` fija un sujeto, así que la cuenta que siembra cada caso acumula las
 * membresías de todas las corridas. Desde D2 una cuenta con dos o más membresías no entra a un
 * destino privado sin elegir, y un caso que solo quiere llegar a su evento tiene que dar ese paso.
 *
 * La elección es la **última** de la lista —la más reciente—, que es el evento que el propio caso
 * acaba de crear; las anteriores son residuo de otras corridas. La elección vive en memoria mientras
 * dura la visita: el caso no recarga después de elegir, sino que navega con la barra.
 */
export async function chooseNewestEvent(page: Page): Promise<void> {
  await expect(page.getByTestId('event-selector-title')).toBeVisible();
  await page.getByTestId('event-choice').last().click();
  // Desde D13 elegir aterriza en la bienvenida, que pide la primera foto.
  await expect(page).toHaveURL(/\/inicio$/);
}

/**
 * Si el selector está delante, elige y sigue; si la cuenta ya tiene una sola membresía, no hace nada.
 * Devuelve si tuvo que elegir, que es lo que decide si el caso necesita volver con la barra.
 */
export async function chooseEventIfAsked(page: Page): Promise<boolean> {
  if (new URL(page.url()).pathname !== '/eventos') {
    return false;
  }

  await chooseNewestEvent(page);
  return true;
}
