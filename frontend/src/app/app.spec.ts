import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { brand } from '@mudanzapp/shared';

import { API_BASE_URL } from './api-base-url.token';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();
  });

  it('renders the public brand name', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const title = fixture.nativeElement.querySelector(
      '[data-testid="shell-brand"]',
    ) as HTMLElement | null;

    expect(title?.textContent).toContain(brand.publicName);
  });

  it('uses the single brand source as the document title', () => {
    TestBed.createComponent(App);

    expect(document.title).toBe(brand.publicName);
  });
});
