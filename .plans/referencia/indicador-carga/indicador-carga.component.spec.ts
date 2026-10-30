import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { IndicadorCargaComponent } from './indicador-carga.component';
import { VEHICULO_POR_ID } from './vehiculos-carga';

describe('IndicadorCargaComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IndicadorCargaComponent],
    }).compileComponents();
  });

  async function crear(carga: number): Promise<ComponentFixture<IndicadorCargaComponent>> {
    const fixture = TestBed.createComponent(IndicadorCargaComponent);
    fixture.componentRef.setInput('carga', carga);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return fixture;
  }

  function medidores(fixture: ComponentFixture<IndicadorCargaComponent>): SVGGElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<SVGGElement>('[role="meter"]'),
    );
  }

  function texto(
    fixture: ComponentFixture<IndicadorCargaComponent>,
    id: string,
  ): SVGTextElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<SVGTextElement>(
      `text[data-vehiculo="${id}"]`,
    );
  }

  it('muestra dos medidores en 12 m3 con el porcentaje real', async () => {
    const fixture = await crear(12);
    const visibles = medidores(fixture);

    // Con v3 en 8 m3, el par desde 8.01 es v2 + v1: 12/18 y 12/40.
    expect(visibles).toHaveLength(2);
    expect(visibles.map((medidor) => medidor.getAttribute('aria-valuenow'))).toEqual(
      expect.arrayContaining(['67', '30']),
    );
  });

  it('muestra solo el vehiculo mayor por encima de 18 m3', async () => {
    const fixture = await crear(18.01);
    const visibles = medidores(fixture);

    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.getAttribute('aria-valuenow')).toBe('45');
  });

  it('topea el porcentaje en 100 por encima de 40 m3', async () => {
    const fixture = await crear(45);
    const visibles = medidores(fixture);

    expect(visibles).toHaveLength(1);
    expect(visibles[0]?.getAttribute('aria-valuenow')).toBe('100');
  });

  it('publica la ventana del par activo', async () => {
    const fixture = await crear(12);
    const ventana = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ventana');

    expect(ventana?.style.getPropertyValue('--dx')).toBe('378');
    expect(ventana?.style.getPropertyValue('--span')).toBe('628');
  });

  it('publica la ventana del par pequeno por debajo de 8 m3', async () => {
    const fixture = await crear(6);
    const ventana = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ventana');

    expect(ventana?.style.getPropertyValue('--dx')).toBe('151');
    expect(ventana?.style.getPropertyValue('--span')).toBe('458');
  });

  it('dibuja el porcentaje real de los cuatro vehiculos', async () => {
    const fixture = await crear(10);

    expect(texto(fixture, 'v1')?.textContent).toBe('25%');
    expect(texto(fixture, 'v2')?.textContent).toBe('56%');
    expect(texto(fixture, 'v3')?.textContent).toBe('100%');
    expect(texto(fixture, 'v4')?.textContent).toBe('100%');
  });

  it('pinta blanco dentro de la caja con el tamano fijo', async () => {
    const fixture = await crear(10);
    const v1 = texto(fixture, 'v1');

    expect(v1?.classList.contains('carga-dentro')).toBe(true);
    expect(v1?.classList.contains('carga-fuera')).toBe(false);
    expect(v1?.getAttribute('font-size')).toBe('64');
  });

  it('reduce el tamano del camion pequeno solo en el 100 %', async () => {
    const comun = texto(await crear(6), 'v3');
    const lleno = texto(await crear(8), 'v3');

    expect(comun?.textContent).toBe('75%');
    expect(comun?.getAttribute('font-size')).toBe('48');
    expect(lleno?.textContent).toBe('100%');
    expect(lleno?.getAttribute('font-size')).toBe('40');
  });

  it('deja la etiqueta de la camioneta arriba de su techo', async () => {
    const fixture = await crear(0);
    const v4 = texto(fixture, 'v4');

    expect(v4?.classList.contains('carga-fuera')).toBe(true);
    expect(v4?.classList.contains('carga-dentro')).toBe(false);
    expect(Number(v4?.getAttribute('y'))).toBeLessThan(VEHICULO_POR_ID.v4.bbox.y);
  });

  it('apaga las transiciones cuando el host reproduce el estado fresco', async () => {
    const fixture = TestBed.createComponent(IndicadorCargaComponent);
    fixture.componentRef.setInput('carga', 5);
    fixture.componentRef.setInput('sinTransicion', true);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).classList.contains('sin-transicion')).toBe(true);
  });
});
