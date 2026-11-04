import { INVITATION_LABELS, nextInvitationLabel } from '../../src/domain/invitation-label.js';

/**
 * El anillo de nombres de invitación (corte 4c-fix, decisión §42).
 *
 * La función es pura —sin base, sin reloj y sin estado—, así que aquí se prueba el orden completo: el
 * arranque, el avance, el cierre del círculo y el reinicio ante un puntero que no pertenece a la lista.
 * El comportamiento real contra la base se ejerce en `test/db/invitation-label.test.ts`.
 */
describe('nextInvitationLabel', () => {
  it('starts at the first word when nobody has emitted yet', () => {
    expect(nextInvitationLabel(null)).toBe('caja');
  });

  it('returns the word that follows the pointer', () => {
    expect(nextInvitationLabel('caja')).toBe('flete');
    expect(nextInvitationLabel('manta')).toBe('soga');
    expect(nextInvitationLabel('lampara')).toBe('cortina');
  });

  it('closes the circle after the last word', () => {
    expect(nextInvitationLabel('alfombra')).toBe('caja');
  });

  it('restarts at the first word when the pointer is not in the list', () => {
    expect(nextInvitationLabel('palabra-ajena')).toBe('caja');
  });

  it('keeps twenty unique lowercase ASCII words', () => {
    expect(INVITATION_LABELS).toHaveLength(20);
    expect(new Set(INVITATION_LABELS).size).toBe(INVITATION_LABELS.length);

    for (const word of INVITATION_LABELS) {
      expect(word).toMatch(/^[a-z]+$/);
    }
  });

  it('walks the whole ring without repeating until it wraps', () => {
    let last: string | null = null;
    const emitted: string[] = [];

    for (let index = 0; index < INVITATION_LABELS.length; index += 1) {
      last = nextInvitationLabel(last);
      emitted.push(last);
    }

    expect(emitted).toEqual([...INVITATION_LABELS]);
    expect(nextInvitationLabel(last)).toBe(INVITATION_LABELS[0]);
  });
});
