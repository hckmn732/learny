import { afterEach, describe, expect, it, vi } from 'vitest';

import { getHealth, setDatabaseQuery } from './health';
import { registerDatabaseHealth } from './health-database';

const CONFIGURED = { DATABASE_URL: 'postgresql://postgres@db:5432/postgres' };

afterEach(() => {
  setDatabaseQuery(null);
  vi.resetModules();
});

describe('[SPEC-101] sonde base de la santé', () => {
  it('registers the probe when DATABASE_URL is configured: ok with 200', async () => {
    const ping = vi.fn(() => Promise.resolve());

    expect(registerDatabaseHealth(CONFIGURED, ping)).toBe(true);
    const { httpStatus, body } = await getHealth({ env: {} });

    expect(ping).toHaveBeenCalledTimes(1);
    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({ status: 'ok', database: 'ok', components: { database: 'ok' } });
  });

  it('reports an unreachable configured database as unavailable (503), without its error', async () => {
    registerDatabaseHealth(CONFIGURED, () =>
      Promise.reject(new Error('connect ECONNREFUSED db.internal:5432')),
    );

    const { httpStatus, body } = await getHealth({ env: {} });

    expect(httpStatus).toBe(503);
    expect(body).toMatchObject({ status: 'degraded', database: 'unavailable' });
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|db\.internal|5432/);
  });

  it('stays not_configured without DATABASE_URL and runs no query', async () => {
    const ping = vi.fn(() => Promise.resolve());

    expect(registerDatabaseHealth({}, ping)).toBe(false);
    const { httpStatus, body } = await getHealth({ env: {} });

    expect(ping).not.toHaveBeenCalled();
    expect(httpStatus).toBe(200);
    expect(body).toMatchObject({ status: 'degraded', database: 'not_configured' });
  });

  it('shares the probe with another copy of the health module (separate Next.js bundles)', async () => {
    registerDatabaseHealth(CONFIGURED, () => Promise.resolve());

    vi.resetModules();
    const routeCopy = await import('./health');
    const { body } = await routeCopy.getHealth({ env: {} });

    expect(body.database).toBe('ok');
  });
});
