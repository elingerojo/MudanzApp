import { expect, test } from '@playwright/test';

/**
 * Humo del arranque: abre **cada** frontend (un `project` por frontend) y exige los valores
 * resueltos del estado —proceso `ok` y base `ok`— en el DOM real.
 *
 * Afirma valores, no la forma del componente: aceptar que la petición resuelva toleraría un
 * `error` o un `not-configured` (`07` §2). El valor observado queda como evidencia del ciclo.
 */
test('the shell resolves process and database as ok', async ({ page }) => {
  // En `wiki` el humo del arranque vive en `/estado`; su `/` es el índice del registro.
  await page.goto(test.info().project.name === 'wiki' ? '/estado' : '/');

  const processState = page.getByTestId('status-process');
  const databaseState = page.getByTestId('status-database');

  await expect(processState).toHaveText('ok');
  await expect(databaseState).toHaveText('ok');

  const observed = {
    process: (await processState.textContent())?.trim() ?? '',
    database: (await databaseState.textContent())?.trim() ?? '',
  };

  const project = test.info().project.name;
  test.info().annotations.push({
    type: 'observed',
    description: `${project}: ${JSON.stringify(observed)}`,
  });

  console.log(`observed ${project} ${JSON.stringify(observed)}`);
});
