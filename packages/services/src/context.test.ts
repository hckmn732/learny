// Unit tests of the service execution context (SPEC-201 ET-6): anonymous requests have no client,
// signed-in requests build the RLS client with the e-mail when known, jobs use the owner role.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestClock } from '../test/support/fakes';

import { createServiceContext, createSystemContext } from './context';

const mocks = vi.hoisted(() => ({
  userDb: vi.fn(),
  serviceDb: vi.fn(),
}));

vi.mock('@learny/db', () => ({
  userDb: mocks.userDb,
  serviceDb: mocks.serviceDb,
}));

const clock = new TestClock();

beforeEach(() => {
  mocks.userDb.mockReset().mockReturnValue({ run: vi.fn() });
  mocks.serviceDb.mockReset().mockReturnValue({ execute: vi.fn() });
});

describe('[SPEC-201] contexte de service', () => {
  it('ne construit aucun client pour une requête publique', () => {
    const ctx = createServiceContext({ userId: null, requestId: 'req-1', clock });
    expect(ctx.userId).toBeNull();
    expect(ctx.db).toBeNull();
    expect(ctx.clock).toBe(clock);
    expect(mocks.userDb).not.toHaveBeenCalled();
  });

  it('construit le client RLS avec l’identifiant puis l’adresse connue', () => {
    createServiceContext({ userId: 'u1', requestId: 'req-1', clock });
    expect(mocks.userDb).toHaveBeenLastCalledWith({ userId: 'u1' });
    createServiceContext({
      userId: 'u2',
      email: 'ada@test.learny.test',
      requestId: 'req-1',
      clock,
    });
    expect(mocks.userDb).toHaveBeenLastCalledWith({
      userId: 'u2',
      email: 'ada@test.learny.test',
    });
    createServiceContext({ userId: 'u3', email: null, requestId: 'req-1', clock });
    expect(mocks.userDb).toHaveBeenLastCalledWith({ userId: 'u3' });
  });

  it('accepte une horloge et un journal injectés (ADR-0047)', () => {
    const logger = { info: vi.fn() } as never;
    const ctx = createServiceContext({
      userId: null,
      requestId: 'req-2',
      clock,
      logger,
    });
    expect(ctx.requestId).toBe('req-2');
    expect(ctx.logger).toBe(logger);
  });

  it('donne aux jobs et webhooks le client propriétaire (service role)', () => {
    const sdb = { execute: vi.fn() };
    mocks.serviceDb.mockReturnValue(sdb);
    const ctx = createSystemContext({ requestId: 'job-1', clock });
    expect(ctx).toMatchObject({ userId: null, db: null, requestId: 'job-1', clock });
    expect(ctx.sdb).toBe(sdb);
    expect(mocks.serviceDb).toHaveBeenCalledTimes(1);
  });
});
