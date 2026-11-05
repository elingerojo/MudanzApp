import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { TILES, isTileBuilt } from '../tiles';
import { IndiceComponent } from './indice.component';

describe('IndiceComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IndiceComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('lista los diez tiles del mapa', async () => {
    const fixture = TestBed.createComponent(IndiceComponent);
    await fixture.whenStable();

    const items = fixture.nativeElement.querySelectorAll('[data-testid^="tile-"]');

    expect(items).toHaveLength(TILES.length);
  });

  it('enlaza solo los tiles ya construidos', async () => {
    const fixture = TestBed.createComponent(IndiceComponent);
    await fixture.whenStable();

    for (const tile of TILES) {
      const item = fixture.nativeElement.querySelector(
        `[data-testid="tile-${tile.code}"]`,
      ) as HTMLElement | null;
      const link = item?.querySelector('a') ?? null;

      expect(link !== null).toBe(isTileBuilt(tile));
    }
  });

  it('conserva el humo accesible en /estado y no enlaza la página heredada', async () => {
    const fixture = TestBed.createComponent(IndiceComponent);
    await fixture.whenStable();

    const anchors = Array.from(
      fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>,
    );
    const hrefs = anchors.map((anchor) => anchor.getAttribute('href'));

    expect(hrefs).toContain('/estado');
    expect(hrefs).not.toContain('/foto-a-ficha');
  });
});
