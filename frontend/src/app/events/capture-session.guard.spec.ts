import { TestBed } from '@angular/core/testing';
import {
  Router,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';

import { requireCaptureSession } from './capture-session.guard';
import { PhotoInboxStore } from './photo-inbox.store';

describe('requireCaptureSession', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter([])] }).compileComponents();
  });

  /** Ejecuta la guarda en el contexto de inyección, como lo hace el router. */
  function run(): unknown {
    return TestBed.runInInjectionContext(() =>
      requireCaptureSession({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );
  }

  it('lets the panel open when the capture session has a photo', () => {
    TestBed.inject(PhotoInboxStore).stage(new File(['foto'], 'foto.png', { type: 'image/png' }));

    expect(run()).toBe(true);
  });

  it('returns to the welcome screen without a photo', () => {
    const expected = TestBed.inject(Router).createUrlTree(['/inicio']);

    expect(run()).toEqual(expected);
  });
});
