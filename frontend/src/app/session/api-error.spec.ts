import { HttpErrorResponse } from '@angular/common/http';

import { PHOTO_INVALID, apiErrorCode } from './api-error';

/**
 * El cliente ramifica por el código estable del borde, nunca por el mensaje ni por el estado
 * (`stack` §9). Un error que no trae código se reporta como ausencia, no como una causa inventada.
 */
describe('apiErrorCode', () => {
  it('reads the stable code from the response body', () => {
    const error = new HttpErrorResponse({ status: 400, error: { error: PHOTO_INVALID } });

    expect(apiErrorCode(error)).toBe('photo_invalid');
  });

  it('returns null when the body is not an object', () => {
    const error = new HttpErrorResponse({ status: 500, error: 'boom' });

    expect(apiErrorCode(error)).toBeNull();
  });

  it('returns null when the body carries no code', () => {
    const error = new HttpErrorResponse({ status: 404, error: { message: 'nope' } });

    expect(apiErrorCode(error)).toBeNull();
  });

  it('returns null for a failure that is not an HTTP error', () => {
    expect(apiErrorCode(new Error('network'))).toBeNull();
    expect(apiErrorCode(null)).toBeNull();
  });
});
