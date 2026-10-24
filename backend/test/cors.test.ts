import { startTestApp } from './support/test-app.js';

// Un origen por frontend, con barra final en la primera entrada para ejercitar la normalización.
const APP_BASE_URL = 'https://mudanzapp.workers.dev/, https://mudanzapp-wiki.workers.dev';

describe('cors middleware', () => {
  it('answers the preflight of an allowed origin with 204 and the CORS headers', async () => {
    const app = await startTestApp('ok', APP_BASE_URL);
    try {
      const response = await fetch(`${app.baseUrl}/health`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://mudanzapp.workers.dev' },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://mudanzapp.workers.dev',
      );
    } finally {
      await app.close();
    }
  });

  it('omits the allow-origin header for an origin outside the allowlist', async () => {
    const app = await startTestApp('ok', APP_BASE_URL);
    try {
      const response = await fetch(`${app.baseUrl}/health`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com' },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('adds the CORS header to the health payload of an allowed origin', async () => {
    const app = await startTestApp('ok', APP_BASE_URL);
    try {
      const response = await fetch(`${app.baseUrl}/health`, {
        headers: { Origin: 'https://mudanzapp-wiki.workers.dev' },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://mudanzapp-wiki.workers.dev',
      );
    } finally {
      await app.close();
    }
  });
});
