import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { brand } from '@mudanzapp/shared';

import { API_BASE_URL } from './api-base-url.token';
import { App } from './app';
import { PhotoInboxStore } from './events/photo-inbox.store';
import { SessionStore } from './session/session.store';

describe('App without session', () => {
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

  it('does not draw the private bar without a session', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="shell-nav"]')).toBeNull();
  });
});

describe('App with session', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: SessionStore, useValue: { hasSession: signal(true) } },
      ],
    }).compileComponents();
  });

  /** Monta la shell con la URL que el router tendría, sin navegar. */
  function render(url: string) {
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'url', 'get').mockReturnValue(url);

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  function navItem(fixture: { nativeElement: unknown }, testId: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testId}"]`);
  }

  it('draws the three fixed destinations of the bar', () => {
    const fixture = render('/captura');

    expect(navItem(fixture, 'shell-nav')).not.toBeNull();
    expect(navItem(fixture, 'shell-nav-capture')).not.toBeNull();
    expect(navItem(fixture, 'shell-nav-captured')).not.toBeNull();
    expect(navItem(fixture, 'shell-nav-account')).not.toBeNull();
  });

  it('marks Captura as the active section', () => {
    const fixture = render('/captura');

    expect(navItem(fixture, 'shell-nav-capture')?.getAttribute('aria-current')).toBe('page');
    expect(navItem(fixture, 'shell-nav-captured')?.getAttribute('aria-current')).toBeNull();
  });

  it('keeps Capturados marked while an article is being edited', () => {
    const fixture = render('/articulos/item-1');

    expect(navItem(fixture, 'shell-nav-captured')?.getAttribute('aria-current')).toBe('page');
    expect(navItem(fixture, 'shell-nav-account')?.getAttribute('aria-current')).toBeNull();
  });

  it('marks Cuenta while the event administration child is open', () => {
    const fixture = render('/cuenta/evento');

    expect(navItem(fixture, 'shell-nav-account')?.getAttribute('aria-current')).toBe('page');
  });

  it('keeps Cuenta marked on the legacy dashboard alias', () => {
    const fixture = render('/dashboard');

    expect(navItem(fixture, 'shell-nav-account')?.getAttribute('aria-current')).toBe('page');
  });

  it('marks Cuenta while the event selector is open', () => {
    const fixture = render('/eventos');

    expect(navItem(fixture, 'shell-nav-account')?.getAttribute('aria-current')).toBe('page');
    expect(navItem(fixture, 'shell-nav-capture')?.getAttribute('aria-current')).toBeNull();
  });

  /** Deja un `FileList` utilizable en el input oculto, como lo haría la cámara. */
  function stageFiles(input: HTMLInputElement, files: readonly File[]): void {
    Object.defineProperty(input, 'files', { value: files, configurable: true });
  }

  function cameraInput(fixture: { nativeElement: unknown }): HTMLInputElement {
    return navItem(fixture, 'shell-photo-input') as HTMLInputElement;
  }

  it('draws the five fixed positions of the bar in order', () => {
    const fixture = render('/captura');
    const positions = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="shell-nav"] li'),
    ).map((position) => position.textContent ?? '');

    expect(positions).toHaveLength(5);
    expect(positions[0]).toContain('Captura');
    expect(positions[1]).toContain('Capturados');
    expect(positions[2]).toContain('Foto');
    expect(positions[3]).toContain('Ayuda');
    expect(positions[4]).toContain('Cuenta');
  });

  it('publishes Foto as an action, not as a destination', () => {
    const fixture = render('/captura');
    const photo = navItem(fixture, 'shell-nav-photo');

    expect(photo?.tagName).toBe('BUTTON');
    expect(photo?.hasAttribute('href')).toBe(false);
    expect(photo?.getAttribute('aria-current')).toBeNull();
    expect(photo?.getAttribute('aria-label')).toBe('Tomar una foto');
  });

  it('keeps Ayuda as an inert gap', () => {
    const fixture = render('/captura');
    const help = navItem(fixture, 'shell-nav-help');

    expect(help?.getAttribute('aria-hidden')).toBe('true');
    expect(help?.hasAttribute('href')).toBe(false);
    expect(help?.hasAttribute('tabindex')).toBe(false);
    expect(help?.querySelector('a, button')).toBeNull();
    expect(help?.textContent).toContain('Ayuda');
  });

  it('opens the hidden camera input from Foto with the accepted types', () => {
    const fixture = render('/cuenta');
    const input = cameraInput(fixture);
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    navItem(fixture, 'shell-nav-photo')?.click();

    expect(click).toHaveBeenCalledTimes(1);
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toContain('image/jpeg');
    expect(input.getAttribute('accept')).toContain('image/webp');
  });

  it('does not navigate or stage a photo when the camera is cancelled', () => {
    const fixture = render('/cuenta');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const input = cameraInput(fixture);
    stageFiles(input, []);
    input.dispatchEvent(new Event('change'));

    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(PhotoInboxStore).take()).toBeNull();
  });

  it('stages the captured photo and opens the capture panel', () => {
    const fixture = render('/cuenta');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const file = new File(['foto'], 'foto.png', { type: 'image/png' });
    const input = cameraInput(fixture);
    stageFiles(input, [file]);
    input.dispatchEvent(new Event('change'));

    expect(navigate).toHaveBeenCalledWith('/captura');
    expect(TestBed.inject(PhotoInboxStore).take()).toBe(file);
  });
});
