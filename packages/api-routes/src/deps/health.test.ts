import { afterEach, describe, expect, it, vi } from 'vitest';

import { HOSTING_REGIONS, isEuRegion, scanText } from '@learny/config';
import { HealthResponse } from '@learny/contracts';

import { buildInfo, getHealth, probeDatabase, type DatabaseQuery } from './health';

const healthy: DatabaseQuery = () => Promise.resolve([{ ok: 1 }]);
const refused: DatabaseQuery = () =>
  Promise.reject(
    new Error('connect ECONNREFUSED postgres://learny:learny-test-only@db.internal:5432/learny'),
  );
const hanging: DatabaseQuery = () => new Promise<never>(() => undefined);

afterEach(() => {
  vi.useRealTimers();
});

describe('[SPEC-006] health', () => {
  it('is ok with a healthy database (200)', async () => {
    const result = await getHealth({ query: healthy, env: {} });
    expect(result).toEqual({
      httpStatus: 200,
      body: {
        status: 'ok',
        version: 'dev',
        commit: 'unknown',
        database: 'ok',
        components: { database: 'ok', build: 'not_configured' },
      },
    });
  });

  it('is degraded with 503 when the database is unavailable', async () => {
    const result = await getHealth({ query: refused, env: {} });
    expect(result.httpStatus).toBe(503);
    expect(result.body).toMatchObject({ status: 'degraded', database: 'unavailable' });
  });

  it('is degraded with 200 when the database is not configured (before SPEC-101)', async () => {
    const result = await getHealth({ query: null, env: {} });
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ status: 'degraded', database: 'not_configured' });
  });

  it('reports a probe exceeding its delay as unavailable and aborts it', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = probeDatabase((s) => {
      signal = s;
      return hanging(s);
    }, 50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toBe('unavailable');
    expect(signal?.aborted).toBe(true);
  });

  it('reads version and commit from the build, with explicit fallbacks', () => {
    expect(buildInfo({})).toEqual({ version: 'dev', commit: 'unknown' });
    expect(buildInfo({ APP_VERSION: '1.2.3', GIT_COMMIT: 'ABCDEF1234567' })).toEqual({
      version: '1.2.3',
      commit: 'abcdef1234567',
    });
    // Anything that is not a version or a commit hash never reaches the response.
    expect(
      buildInfo({ APP_VERSION: 'postgres://u:p@host/db', GIT_COMMIT: 'host.internal' }),
    ).toEqual({ version: 'dev', commit: 'unknown' });
  });

  it('exposes only the public fields, without any secret or connection detail', async () => {
    const { body } = await getHealth({ query: refused, env: {} });
    expect(Object.keys(body).sort()).toEqual([
      'commit',
      'components',
      'database',
      'status',
      'version',
    ]);
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/postgres|ECONNREFUSED|db\.internal|learny-test-only|5432/);
    expect(scanText(json, 'health')).toEqual([]);
  });

  it('validates the contract: five required fields, extra fields allowed', () => {
    const valid = {
      status: 'ok',
      version: 'dev',
      commit: 'unknown',
      database: 'ok',
      components: { database: 'ok', build: 'ok' },
    };
    expect(HealthResponse.safeParse({ ...valid, uptime: 3 }).success).toBe(true);
    for (const field of ['status', 'version', 'commit', 'database', 'components'] as const) {
      const rest: Record<string, unknown> = { ...valid };
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete rest[field];
      expect(HealthResponse.safeParse(rest).success, field).toBe(false);
    }
    expect(HealthResponse.safeParse({ ...valid, database: 'down' }).success).toBe(false);
    expect(
      HealthResponse.safeParse({ ...valid, components: { database: 'ok', build: 'down' } }).success,
    ).toBe(false);
  });

  it('keeps every declared hosting region in the EU (BR-PLA-04)', () => {
    for (const [service, region] of Object.entries(HOSTING_REGIONS)) {
      expect(isEuRegion(region), service).toBe(true);
    }
  });
});
