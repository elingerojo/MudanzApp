import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, type UrlTree } from '@angular/router';
import { firstValueFrom, isObservable, type Observable } from 'rxjs';

import { requireEventChoice } from './event-choice.guard';
import { SessionStore } from './session.store';

/**
 * La guarda del selector (corte D2).
 *
 * Tres salidas y ninguna inventa la membresía: sin credencial, al canje; con dos o más membresías sin
 * elección, a `/eventos`; con una sola —o con la elección ya hecha—, pasa. Como la lista llega de una
 * lectura, la guarda espera a que el estado deje de cargar antes de decidir.
 */
type IdentityStatus = 'idle' | 'loading' | 'reloading' | 'error' | 'resolved';

function isUrlTree(value: unknown): value is UrlTree {
  return typeof value === 'object' && value !== null && 'root' in value;
}

describe('requireEventChoice', () => {
  let hasSession = true;
  const identityStatus = signal<IdentityStatus>('resolved');
  const requiresEventChoice = signal(false);

  beforeEach(() => {
    hasSession = true;
    identityStatus.set('resolved');
    requiresEventChoice.set(false);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { hasSession: () => hasSession, identityStatus, requiresEventChoice },
        },
      ],
    });
  });

  function start(): boolean | UrlTree | Observable<boolean | UrlTree> {
    return TestBed.runInInjectionContext(() => requireEventChoice({} as never, {} as never)) as
      boolean | UrlTree | Observable<boolean | UrlTree>;
  }

  it('sends a device with no credential to the redemption screen', () => {
    hasSession = false;

    const result = start();

    expect(isUrlTree(result) && result.toString()).toBe('/invitacion');
  });

  it('sends an account with several memberships and no choice to the selector', async () => {
    requiresEventChoice.set(true);

    const result = await firstValueFrom(start() as Observable<boolean | UrlTree>);

    expect(isUrlTree(result) && result.toString()).toBe('/eventos');
  });

  it('lets a single membership through without asking', async () => {
    const result = start();

    expect(isObservable(result)).toBe(true);
    await expect(firstValueFrom(result as Observable<boolean | UrlTree>)).resolves.toBe(true);
  });

  it('waits for the identity before deciding', async () => {
    identityStatus.set('loading');
    requiresEventChoice.set(true);

    const result = firstValueFrom(start() as Observable<boolean | UrlTree>);
    TestBed.tick();

    identityStatus.set('resolved');
    TestBed.tick();

    const tree = await result;
    expect(isUrlTree(tree) && tree.toString()).toBe('/eventos');
  });

  it('does not keep waiting when the identity read fails', async () => {
    identityStatus.set('error');

    await expect(firstValueFrom(start() as Observable<boolean | UrlTree>)).resolves.toBe(true);
  });
});
