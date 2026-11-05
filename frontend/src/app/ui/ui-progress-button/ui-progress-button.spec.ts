import { TestBed } from '@angular/core/testing';

import {
  PROGRESS_DONE_FLASH_MS,
  UiProgressButtonComponent,
  type UiProgressState,
} from './ui-progress-button';

/**
 * El botón con progreso del ciclo 4g (`plan-ciclo-4g-direct-upload` §5): un mismo control que dice
 * cuánto falta, que no se puede pulsar dos veces y que nunca miente con el 100 %.
 */
describe('UiProgressButtonComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiProgressButtonComponent],
    }).compileComponents();
  });

  interface Options {
    readonly label?: string;
    readonly progress?: number | null;
    readonly state?: UiProgressState;
    readonly disabled?: boolean;
  }

  function render(options: Options = {}) {
    const fixture = TestBed.createComponent(UiProgressButtonComponent);
    fixture.componentRef.setInput('label', options.label ?? 'Publicar');
    fixture.componentRef.setInput('progress', options.progress ?? null);
    fixture.componentRef.setInput('state', options.state ?? 'idle');
    fixture.componentRef.setInput('disabled', options.disabled ?? false);
    fixture.componentRef.setInput('testId', 'item-form-publish');
    fixture.detectChanges();
    return fixture;
  }

  type Fixture = ReturnType<typeof render>;

  function control(fixture: Fixture): HTMLButtonElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="item-form-publish"]',
    ) as HTMLButtonElement;
  }

  function fill(fixture: Fixture): HTMLElement {
    return fixture.nativeElement.querySelector(
      '[data-testid="progress-button-fill"]',
    ) as HTMLElement;
  }

  function status(fixture: Fixture): string {
    const element = fixture.nativeElement.querySelector(
      '[data-testid="progress-button-status"]',
    ) as HTMLElement;

    return element.textContent?.trim() ?? '';
  }

  it('shows the action and stays pressable while idle', () => {
    const fixture = render();

    expect(control(fixture).textContent?.trim()).toBe('Publicar');
    expect(control(fixture).disabled).toBe(false);
    expect(control(fixture).getAttribute('aria-busy')).toBe('false');
    expect(fill(fixture).style.width).toBe('0%');
  });

  it('replaces the label with the real percentage and closes the control while working', () => {
    const fixture = render({ state: 'working', progress: 42 });

    expect(control(fixture).textContent?.trim()).toBe('42%');
    expect(control(fixture).disabled).toBe(true);
    expect(control(fixture).getAttribute('aria-busy')).toBe('true');
    expect(control(fixture).getAttribute('aria-label')).toBe('Publicar');
    expect(fill(fixture).style.width).toBe('42%');
  });

  it('never shows one hundred percent before the work is confirmed', () => {
    const fixture = render({ state: 'working', progress: 100 });

    expect(control(fixture).textContent?.trim()).toBe('99%');
    expect(fill(fixture).style.width).toBe('99%');
  });

  it('intensifies the fill as the transfer advances', () => {
    const early = render({ state: 'working', progress: 5 });
    const late = render({ state: 'working', progress: 95 });

    expect(Number(fill(early).style.opacity)).toBeLessThan(Number(fill(late).style.opacity));
  });

  it('announces four milestones and nothing in between', () => {
    expect(status(render({ state: 'working', progress: 10 }))).toBe('');
    expect(status(render({ state: 'working', progress: 30 }))).toBe('25%');
    expect(status(render({ state: 'working', progress: 60 }))).toBe('50%');
    expect(status(render({ state: 'working', progress: 80 }))).toBe('75%');
    expect(status(render({ state: 'working', progress: 100 }))).toBe('99%');
  });

  it('flashes a done state, disabled, and keeps the flash short', () => {
    const fixture = render({ state: 'done', progress: 100 });

    expect(PROGRESS_DONE_FLASH_MS).toBe(250);
    expect(control(fixture).textContent?.trim()).toBe('Listo');
    expect(control(fixture).disabled).toBe(true);
    expect(control(fixture).getAttribute('data-state')).toBe('done');
    expect(fill(fixture).style.width).toBe('0%');
  });

  it('respects an explicit disabled even when idle', () => {
    const fixture = render({ disabled: true });

    expect(control(fixture).disabled).toBe(true);
    expect(control(fixture).textContent?.trim()).toBe('Publicar');
  });
});
