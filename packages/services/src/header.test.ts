// Unit tests of the fixed header service (SPEC-305 EF-1, EF-4, ET-2, ET-4; CL-1). The RLS client
// is a fake: these tests pin the DTO projection and the abbreviated address, never the SQL.
import { describe, expect, it } from 'vitest';

import type { UserDatabase } from '@learny/db';

import type { ServiceContext } from './context';
import { abbreviateEmail, getHeader } from './header';

const USER = '11111111-1111-4111-8111-111111111111';

function context(rows: unknown[]): ServiceContext {
  const db = {
    run: (flow: (tx: unknown) => Promise<unknown>) =>
      flow({ execute: () => Promise.resolve(rows) }),
  } as unknown as UserDatabase;
  return { userId: USER, requestId: 'req-header', db, clock: {} as never, logger: {} as never };
}

describe('[SPEC-305] Coquille : en-tête figé — service', () => {
  it('abrège l’adresse sans jamais exposer la partie locale (CL-1)', () => {
    expect(abbreviateEmail('alice@example.com')).toBe('a***@example.com');
    expect(abbreviateEmail('  bob@learny.fr  ')).toBe('b***@learny.fr');
    expect(abbreviateEmail('élise@example.com')).toBe('é***@example.com');
    expect(abbreviateEmail(null)).toBeNull();
    expect(abbreviateEmail('')).toBeNull();
    expect(abbreviateEmail('sans-arobase')).toBeNull();
    expect(abbreviateEmail('@example.com')).toBeNull();
    expect(abbreviateEmail('alice@')).toBeNull();
  });

  it('projette le profil et les compteurs dans le DTO (ET-1, ET-4)', async () => {
    const result = await getHeader(
      context([
        {
          first_name: 'Ada',
          last_name: 'Lovelace',
          email: 'ada@example.com',
          active_count: 2,
          unread_count: 3,
        },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        emailLabel: 'a***@example.com',
        activeFormationCount: 2,
        unreadNotificationCount: 3,
      },
    });
  });

  it('normalise les noms vides et les compteurs négatifs', async () => {
    const result = await getHeader(
      context([
        {
          first_name: '   ',
          last_name: null,
          email: null,
          active_count: -1,
          unread_count: -4,
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        firstName: null,
        lastName: null,
        emailLabel: null,
        activeFormationCount: 0,
        unreadNotificationCount: 0,
      },
    });
  });

  it('répond NOT_FOUND quand le profil est absent', async () => {
    const result = await getHeader(context([]));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('répond UNAUTHENTICATED sans session', async () => {
    const result = await getHeader({
      userId: null,
      requestId: 'req-header',
      db: null,
      clock: {} as never,
      logger: {} as never,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
