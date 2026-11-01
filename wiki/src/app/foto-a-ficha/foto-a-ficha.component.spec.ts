import { TestBed } from '@angular/core/testing';
import { AI_DRAFT_LIMITS } from '@mudanzapp/shared';

import { FotoAFichaComponent } from './foto-a-ficha.component';

/**
 * La sección 3 del dossier (`plan-ciclo-3d` §8): los límites que muestra salen del contrato compartido
 * y las afirmaciones del corte están en la página. Es una página estática: no pide sesión ni red.
 */
describe('FotoAFichaComponent', () => {
  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [FotoAFichaComponent] }).compileComponents();

    const fixture = TestBed.createComponent(FotoAFichaComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the limits imported from the shared contract', async () => {
    const element = await render();
    const text = element.textContent ?? '';

    expect(text).toContain(String(AI_DRAFT_LIMITS.title));
    expect(text).toContain(String(AI_DRAFT_LIMITS.note));
  });

  it('states what the model returns and what it never decides', async () => {
    const element = await render();

    expect(element.querySelector('[data-testid="foto-a-ficha-devuelve"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="foto-a-ficha-no-decide"]')?.textContent).toContain(
      'medidas, peso, precio ni destino',
    );
  });

  it('states how the output is validated and what happens when the provider fails', async () => {
    const element = await render();

    expect(element.querySelector('[data-testid="foto-a-ficha-valida"]')?.textContent).toContain(
      'esquema estricto',
    );
    expect(element.querySelector('[data-testid="foto-a-ficha-falla"]')?.textContent).toContain(
      'se escribe a mano',
    );
  });

  it('explains why the human review is mandatory', async () => {
    const element = await render();

    expect(element.querySelector('[data-testid="foto-a-ficha-revision"]')?.textContent).toContain(
      'WhatsApp',
    );
  });
});
