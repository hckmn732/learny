// Unit tests of the provided-AI entitlement (SPEC-210 EF-6, BR-IA-06). The owner-role client is
// a fake: these tests pin the read-on-every-call decision and its boundaries.
import { describe, expect, it } from 'vitest';

import type { Db } from '@learny/db';

import { TestClock } from '../../test/support/fakes';

import { hasManagedAi, isManagedAiEntitled } from './entitlement';

function db(rows: unknown[]): Db {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
  };
  return { select: () => chain } as unknown as Db;
}

const NOW = new TestClock('2026-11-11T12:20:00Z');

describe('[SPEC-210] droit à l’IA fournie', () => {
  it('refuse sans abonnement, hors période ou pour un autre statut (BR-IA-06)', () => {
    expect(isManagedAiEntitled(null, NOW.now())).toBe(false);
    expect(isManagedAiEntitled(undefined, NOW.now())).toBe(false);
    expect(
      isManagedAiEntitled(
        { status: 'past_due', currentPeriodEnd: new Date('2026-12-01') },
        NOW.now(),
      ),
    ).toBe(false);
    expect(isManagedAiEntitled({ status: 'active', currentPeriodEnd: null }, NOW.now())).toBe(
      false,
    );
    expect(
      isManagedAiEntitled(
        { status: 'active', currentPeriodEnd: new Date('2026-11-10') },
        NOW.now(),
      ),
    ).toBe(false);
    expect(
      isManagedAiEntitled(
        { status: 'active', currentPeriodEnd: new Date('2026-11-20') },
        NOW.now(),
      ),
    ).toBe(true);
  });

  it('lit l’abonnement à chaque appel et applique la décision (EF-6)', async () => {
    await expect(
      hasManagedAi('11111111-1111-4111-8111-111111111111', {
        db: db([{ status: 'active', currentPeriodEnd: new Date('2026-11-20') }]),
        clock: NOW,
      }),
    ).resolves.toBe(true);

    await expect(
      hasManagedAi('11111111-1111-4111-8111-111111111111', { db: db([]), clock: NOW }),
    ).resolves.toBe(false);
  });
});
