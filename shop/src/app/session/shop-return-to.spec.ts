import {
  clearShopReturnTo,
  readShopReturnTo,
  safeShopReturnTo,
  saveShopReturnTo,
} from './shop-return-to';

/**
 * El regreso del acceso opcional (extensión de 4d): una ruta interna del mapa público se conserva y
 * cualquier destino externo vuelve a la cuenta.
 */
describe('shop return-to', () => {
  afterEach(() => {
    clearShopReturnTo();
  });

  it('round-trips an internal public path and clears it', () => {
    saveShopReturnTo('/evento/bogota-ciudad-de-mexico-3f9a2c');

    expect(readShopReturnTo()).toBe('/evento/bogota-ciudad-de-mexico-3f9a2c');

    clearShopReturnTo();
    expect(readShopReturnTo()).toBeNull();
  });

  it('accepts only internal public paths', () => {
    expect(safeShopReturnTo('/evento/bogota-ciudad-de-mexico-3f9a2c')).toBe(
      '/evento/bogota-ciudad-de-mexico-3f9a2c',
    );
    expect(safeShopReturnTo('/mesa-de-roble-3f9a2c')).toBe('/mesa-de-roble-3f9a2c');
    expect(safeShopReturnTo('https://evil.example')).toBe('/cuenta');
    expect(safeShopReturnTo('//evil.example')).toBe('/cuenta');
    expect(safeShopReturnTo('/auth/callback')).toBe('/cuenta');
    expect(safeShopReturnTo(null)).toBe('/cuenta');
  });
});
