import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthResponse } from '@learny/contracts';

import * as route from '../../app/api/v1/health/route';
import { setDatabaseQuery } from '../../lib/health';

const { GET } = route;

describe('[SPEC-001] GET /api/v1/health', () => {
  // SPEC-006 enriched the body (version, commit, database); `status` stays (backward compatible).
  // Before SPEC-101 the database is not configured: 200 with status "degraded".
  it('returns 200 with a status field and no-store', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'degraded' });
  });
});

describe('[SPEC-006] health routes', () => {
  afterEach(() => {
    setDatabaseQuery(null);
    vi.unstubAllEnvs();
  });

  async function get() {
    const response = await GET();
    return { response, body: (await response.json()) as Record<string, unknown> };
  }

  it('answers 200 ok with a healthy injected probe, uncached JSON, without session', async () => {
    setDatabaseQuery(() => Promise.resolve([{ ok: 1 }]));
    const { response, body } = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(HealthResponse.parse(body)).toEqual({
      status: 'ok',
      version: 'dev',
      commit: 'unknown',
      database: 'ok',
    });
  });

  it('answers 503 degraded when the injected probe fails, without the connection message', async () => {
    setDatabaseQuery(() =>
      Promise.reject(new Error('password authentication failed for db.internal:5432')),
    );
    const { response, body } = await get();
    expect(response.status).toBe(503);
    expect(body).toEqual({
      status: 'degraded',
      version: 'dev',
      commit: 'unknown',
      database: 'unavailable',
    });
    expect(JSON.stringify(body)).not.toMatch(/password|db\.internal|5432/);
  });

  it('answers 200 degraded when the database is not configured (no query is made)', async () => {
    const { response, body } = await get();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'degraded', database: 'not_configured' });
  });

  it('answers 503 within the bounded delay when the probe hangs', async () => {
    let aborted = false;
    setDatabaseQuery(
      (signal) =>
        new Promise<never>(() => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
    );
    const { response, body } = await get();
    expect(response.status).toBe(503);
    expect(body.database).toBe('unavailable');
    expect(aborted).toBe(true);
  });

  it('exposes the build version and commit given at deployment', async () => {
    vi.stubEnv('APP_VERSION', '1.4.0');
    vi.stubEnv('GIT_COMMIT', '0123456789abcdef0123456789abcdef01234567');
    const { body } = await get();
    expect(body).toMatchObject({
      version: '1.4.0',
      commit: '0123456789abcdef0123456789abcdef01234567',
    });
  });

  it('exports GET only: Next.js answers 405 to POST', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});
