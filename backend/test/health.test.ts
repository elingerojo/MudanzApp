import { startTestApp } from './support/test-app.js';

describe('health endpoints', () => {
  it('serves liveness with the database state even when the database is down', async () => {
    const app = await startTestApp('error');
    try {
      const response = await fetch(`${app.baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok', database: 'error' });
    } finally {
      await app.close();
    }
  });

  it('serves readiness as 200 when the database is ok', async () => {
    const app = await startTestApp('ok');
    try {
      const response = await fetch(`${app.baseUrl}/health/db`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok', database: 'ok' });
    } finally {
      await app.close();
    }
  });

  it('serves readiness as 503 when the database reports not-configured', async () => {
    const app = await startTestApp('not-configured');
    try {
      const response = await fetch(`${app.baseUrl}/health/db`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        status: 'degraded',
        database: 'not-configured',
      });
    } finally {
      await app.close();
    }
  });
});
