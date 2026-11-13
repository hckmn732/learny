// Unit tests of the read-only formation access check (SPEC-615 ET-1, CL-1). The transaction is a
// fake: these tests pin the owner/member visibility and the malformed identifier refusal, not SQL.

import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { canAccessFormation } from './access';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-access',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

describe('[SPEC-615] accès en lecture à une formation', () => {
  it('autorise une formation visible par le propriétaire ou un membre actif (ET-1)', async () => {
    const execute = vi.fn().mockResolvedValue([{ id: FORMATION }]);

    const result = await canAccessFormation(context(execute), FORMATION);

    expect(result).toMatchObject({ ok: true, value: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('refuse une formation étrangère sans révéler son existence (CA-4)', async () => {
    const execute = vi.fn().mockResolvedValue([]);

    const result = await canAccessFormation(context(execute), FORMATION);

    expect(result).toMatchObject({ ok: true, value: false });
  });

  it('refuse un identifiant mal formé sans ouvrir de transaction (CL-1)', async () => {
    const execute = vi.fn();

    const result = await canAccessFormation(context(execute), 'pas-un-uuid');

    expect(result).toMatchObject({ ok: true, value: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuse un appel sans session', async () => {
    const result = await canAccessFormation(
      {
        userId: null,
        requestId: 'req-access',
        db: null,
        clock: new TestClock(NOW.toISOString()),
        logger: {} as never,
      },
      FORMATION,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
