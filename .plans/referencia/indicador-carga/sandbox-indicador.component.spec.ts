import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { SandboxIndicadorComponent } from './sandbox-indicador.component';

describe('SandboxIndicadorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SandboxIndicadorComponent],
    }).compileComponents();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function crear(): {
    element: HTMLElement;
    input: HTMLInputElement;
    form: HTMLFormElement;
    fixture: ComponentFixture<SandboxIndicadorComponent>;
  } {
    const fixture = TestBed.createComponent(SandboxIndicadorComponent);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    return {
      element,
      input: element.querySelector('[data-testid="volumen"]') as HTMLInputElement,
      form: element.querySelector('form') as HTMLFormElement,
      fixture,
    };
  }

  function agregar(
    input: HTMLInputElement,
    form: HTMLFormElement,
    valor: string,
    fixture: ComponentFixture<SandboxIndicadorComponent>,
  ): void {
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  function texto(element: HTMLElement, testId: string): string {
    return element.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';
  }

  function total(element: HTMLElement): string {
    return element.querySelector('[data-testid="total"]')?.textContent ?? '';
  }

  function estaSinTransicion(element: HTMLElement): boolean {
    return (
      element.querySelector('app-indicador-carga')?.classList.contains('sin-transicion') ?? false
    );
  }

  /** Sustituye rAF por una cola manual: los frames se pintan cuando la prueba lo decide. */
  function colaDeFrames(): () => void {
    const pendientes: FrameRequestCallback[] = [];

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pendientes.push(callback);

      return pendientes.length;
    });

    return () => {
      while (pendientes.length > 0) {
        pendientes.shift()?.(0);
      }
    };
  }

  it('acumula el volumen de cada Agregar', async () => {
    const { element, input, form, fixture } = crear();

    agregar(input, form, '2.5', fixture);
    agregar(input, form, '2.5', fixture);
    await fixture.whenStable();

    expect(total(element)).toContain('5 m³');
  });

  it('ignora valores vacios o cero', async () => {
    const { element, input, form, fixture } = crear();

    agregar(input, form, '', fixture);
    agregar(input, form, '0', fixture);
    await fixture.whenStable();

    expect(total(element)).toContain('0 m³');
  });

  it('etiqueta la accion segun el signo', async () => {
    const { element, input, fixture } = crear();

    input.value = '-3';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(texto(element, 'agregar')).toBe('Restar');
  });

  it('resta con piso en 0 y reproduce el estado fresco antes de animar', async () => {
    const pintar = colaDeFrames();
    const { element, input, form, fixture } = crear();

    agregar(input, form, '10', fixture);
    expect(total(element)).toContain('10 m³');

    agregar(input, form, '-3', fixture);

    // Fase 1: estado fresco, total descartado y transiciones apagadas.
    expect(total(element)).toContain('0 m³');
    expect(estaSinTransicion(element)).toBe(true);

    // Fase 2: el frame siguiente aplica el destino y devuelve las transiciones.
    pintar();
    fixture.detectChanges();

    expect(total(element)).toContain('7 m³');
    expect(estaSinTransicion(element)).toBe(false);
  });

  it('no deja el total por debajo de 0', async () => {
    const pintar = colaDeFrames();
    const { element, input, form, fixture } = crear();

    agregar(input, form, '4', fixture);
    agregar(input, form, '-10', fixture);
    pintar();
    fixture.detectChanges();

    expect(total(element)).toContain('0 m³');
    expect(estaSinTransicion(element)).toBe(false);
  });

  it('reinicia la carga al estado fresco', async () => {
    const pintar = colaDeFrames();
    const { element, input, form, fixture } = crear();

    agregar(input, form, '6', fixture);

    element.querySelector<HTMLButtonElement>('[data-testid="reiniciar-carga"]')?.click();
    fixture.detectChanges();

    expect(total(element)).toContain('0 m³');
    expect(estaSinTransicion(element)).toBe(true);

    pintar();
    fixture.detectChanges();

    expect(estaSinTransicion(element)).toBe(false);
  });
});
