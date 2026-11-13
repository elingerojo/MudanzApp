import {
  PhotoStateError,
  advancePhotoState,
  type PhotoUploadEvent,
  type PhotoUploadState,
} from './photo-pipeline';

/**
 * Evidencia unitaria del ciclo 3f (`plan-ciclo-3f` §7): la máquina de estados de una foto, sin DOM y
 * sin red.
 *
 * Las dos invariantes que la tira necesita para no mentir: una foto no se declara subida sin haber
 * pasado por `uploading`, y una foto no puede empezar dos subidas a la vez —la segunda es un defecto
 * del cliente, no un estado—.
 */

describe('advancePhotoState', () => {
  it('walks the happy path from the phone to the article', () => {
    expect(advancePhotoState('optimizing', 'optimized')).toBe('local');
    expect(advancePhotoState('local', 'start')).toBe('uploading');
    expect(advancePhotoState('uploading', 'done')).toBe('uploaded');
  });

  it('marks a failed photo and lets it start a new upload', () => {
    expect(advancePhotoState('uploading', 'fail')).toBe('failed');
    expect(advancePhotoState('failed', 'start')).toBe('uploading');
  });

  it('never reaches uploaded without uploading first', () => {
    for (const from of ['optimizing', 'local', 'failed'] as const) {
      expect(() => advancePhotoState(from, 'done')).toThrow(PhotoStateError);
    }
  });

  it('refuses a second simultaneous upload of the same photo', () => {
    expect(() => advancePhotoState('uploading', 'start')).toThrow(PhotoStateError);
  });

  it('does not go back to the phone once a photo is in the article', () => {
    for (const event of ['optimized', 'start', 'done', 'fail'] as const) {
      expect(() => advancePhotoState('uploaded', event)).toThrow(PhotoStateError);
    }
  });

  it('names the transition it refused, so the defect is findable', () => {
    expect(() => advancePhotoState('local', 'done')).toThrow('photo-state-invalid:local:done');
  });

  it('covers every state and every event: no transition is left undefined by accident', () => {
    const states: readonly PhotoUploadState[] = [
      'optimizing',
      'local',
      'uploading',
      'uploaded',
      'failed',
    ];
    const events: readonly PhotoUploadEvent[] = ['optimized', 'start', 'done', 'fail'];

    // La tabla es la fuente: aquí solo se afirma que cada estado se puede consultar sin reventar por
    // una llave ausente, y que las transiciones legales son exactamente las declaradas.
    const legal = new Set([
      'optimizing:optimized',
      'local:start',
      'uploading:done',
      'uploading:fail',
      'failed:start',
    ]);

    for (const state of states) {
      for (const event of events) {
        const key = `${state}:${event}`;
        if (legal.has(key)) {
          expect(advancePhotoState(state, event)).toBeTypeOf('string');
          continue;
        }

        expect(() => advancePhotoState(state, event)).toThrow(PhotoStateError);
      }
    }
  });
});
