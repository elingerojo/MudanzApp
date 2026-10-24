import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API_BASE_URL } from '../api-base-url.token';
import { StatusComponent } from './status.component';

describe('StatusComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('renders the process and database state from /health', async () => {
    const fixture = TestBed.createComponent(StatusComponent);
    fixture.detectChanges();

    httpTesting.expectOne('/api/health').flush({ status: 'ok', database: 'ok' });

    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="status-process"]')?.textContent).toContain('ok');
    expect(element.querySelector('[data-testid="status-database"]')?.textContent).toContain('ok');
  });
});
