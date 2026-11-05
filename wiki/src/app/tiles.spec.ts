import { routes } from './app.routes';
import { TILES, isTileBuilt } from './tiles';

/**
 * El mapa es un contrato: estos casos fijan los diez códigos, la forma de la ruta y la
 * correspondencia entre tiles construidos y rutas publicadas. Un tile nuevo que olvide su cargador
 * o publique una ruta suelta falla aquí.
 */
describe('mapa de tiles', () => {
  it('declara los diez tiles del registro en orden de bloque', () => {
    expect(TILES.map((tile) => tile.code)).toEqual([
      'M0',
      'E1',
      'E2',
      'E3',
      'A0',
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
    ]);
  });

  it('usa rutas agrupadas con código y slug', () => {
    for (const tile of TILES) {
      expect(tile.route).toMatch(/^(ingenieria|app)\/[a-z][a-z0-9]*-[a-z][a-z0-9-]*$/);
    }
  });

  it('usa el bloque de la ruta como bloque del tile', () => {
    for (const tile of TILES) {
      expect(tile.route.startsWith(`${tile.block}/`)).toBe(true);
    }
  });

  it('publica una ruta por tile construido y ninguna de más', () => {
    const declared = routes
      .map((route) => route.path)
      .filter((path): path is string => path !== undefined && /^(ingenieria|app)\//.test(path));
    const built = TILES.filter(isTileBuilt).map((tile) => tile.route);

    expect(declared.sort()).toEqual(built.sort());
  });

  it('resuelve el índice primero y el comodín al final', () => {
    expect(routes[0]?.path).toBe('');
    expect(routes.at(-1)?.path).toBe('**');
    expect(routes.some((route) => route.path === 'estado')).toBe(true);
  });

  it('conserva la página heredada hasta que A2 y A4 la absorban', () => {
    const heredada = routes.find((route) => route.path === 'foto-a-ficha');

    expect(heredada).toBeDefined();
  });
});
