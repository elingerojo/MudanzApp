import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { brand } from '@mudanzapp/shared';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the public brand name', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector(
      '[data-testid="app-title"]',
    ) as HTMLElement | null;

    expect(title?.textContent).toContain(brand.publicName);
  });

  it('uses the single brand source as the document title', () => {
    TestBed.createComponent(App);

    expect(document.title).toBe(brand.publicName);
  });
});
