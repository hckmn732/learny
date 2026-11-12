// Unit tests of the Postgres token-bucket limiter (SPEC-208 EF-1 to EF-4, ET-1, ET-4): the atomic
// refill statement is a fake, the clock is injected, a database failure refuses the request.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestClock } from '../../test/support/fakes';

import { createPostgresRateLimiter, createServiceRateLimiter } from './rate-limit';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  serviceDb: vi.fn(),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql, serviceDb: mocks.serviceDb, schema: {} }));

const clock = new TestClock();
const SECRET = 'x'.repeat(40);
const USER = '11111111-1111-4111-8111-111111111111';

function database(...results: unknown[]) {
  const execute = vi.fn();
  for (const result of results) {
    if (result instanceof Error) execute.mockRejectedValueOnce(result);
    else execute.mockResolvedValueOnce(result);
  }
  return { execute };
}

beforeEach(() => {
  mocks.sql.mockClear();
  mocks.serviceDb.mockReset();
  clock.set('2026-11-11T12:20:00Z');
});

describe('[SPEC-208] limiteur Postgres', () => {
  it('consomme un jeton et renvoie le reste entier (EF-1)', async () => {
    const db = database([{ tokens: '119.0000' }]);
    const limiter = createPostgresRateLimiter(db as never, clock, SECRET);
    await expect(
      limiter.consume({ profile: 'default', userId: USER, ip: null, routeId: 'GET /x' }),
    ).resolves.toEqual({ allowed: true, remaining: 119, retryAfterSeconds: null, limit: 120 });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(mocks.sql.mock.calls.some((call) => call[1] === `user:${USER}:default`)).toBe(true);
    expect(
      mocks.sql.mock.calls.some((call) => call.slice(1).includes('2026-11-11T12:20:00.000Z')),
    ).toBe(true);
  });

  it('refuse sans jeton et calcule le délai avant le prochain (EF-2)', async () => {
    const db = database([], [{ tokens: '0.5', elapsed: '0' }]);
    const limiter = createPostgresRateLimiter(db as never, clock, SECRET);
    await expect(
      limiter.consume({ profile: 'default', userId: null, ip: '203.0.113.9', routeId: 'POST /x' }),
    ).resolves.toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1, limit: 120 });
    expect(db.execute).toHaveBeenCalledTimes(2);
    // The refusal state is read on the same bucket, keyed by the hashed address.
    const readState = mocks.sql.mock.calls.find((call) =>
      call.slice(1).some((value) => typeof value === 'string' && value.startsWith('ip:')),
    );
    expect(
      readState
        ?.slice(1)
        .some((value) => typeof value === 'string' && /^ip:[0-9a-f]{32}:default$/.test(value)),
    ).toBe(true);
  });

  it('refuse une requête quand la base est indisponible, jamais sans contrôle (EF-1)', async () => {
    const db = database(new Error('connexion perdue'));
    const limiter = createPostgresRateLimiter(db as never, clock, SECRET);
    await expect(
      limiter.consume({ profile: 'ai', userId: USER, ip: null, routeId: 'POST /ai' }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('utilise le client propriétaire pour les routes sans policy (ET-4)', async () => {
    const db = database([{ tokens: '9.0000' }]);
    mocks.serviceDb.mockReturnValue(db);
    const limiter = createServiceRateLimiter(clock, SECRET);
    await expect(
      limiter.consume({ profile: 'auth', userId: null, ip: '198.51.100.7', routeId: 'POST /auth' }),
    ).resolves.toEqual({ allowed: true, remaining: 9, retryAfterSeconds: null, limit: 10 });
    expect(mocks.serviceDb).toHaveBeenCalled();
  });
});
