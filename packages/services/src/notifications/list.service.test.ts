// Unit tests of the notification panel mutations (SPEC-306 EF-2, EF-3, ET-2). The repository
// functions are mocked: these tests pin authentication, idempotence and the never-negative count.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import {
  getUnreadNotificationCount,
  listNotifications,
  markAllRead,
  markNotificationRead,
} from './list';

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  get: vi.fn(),
  mark: vi.fn(),
  markAll: vi.fn(),
}));

vi.mock('@learny/db', () => ({
  schema: { formations: {}, notifications: {}, profiles: {} },
  countUnreadNotifications: mocks.count,
  getNotification: mocks.get,
  markAllNotificationsRead: mocks.markAll,
  markNotificationRead: mocks.mark,
}));

const USER = '11111111-1111-4111-8111-111111111111';
const NOTIFICATION = '22222222-2222-4222-8222-222222222222';

function context(): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-notifications',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({}) } as unknown as UserDatabase,
    clock: new TestClock('2026-11-11T12:20:00Z'),
    logger: {} as never,
  };
}

beforeEach(() => {
  mocks.count.mockReset();
  mocks.get.mockReset();
  mocks.mark.mockReset();
  mocks.markAll.mockReset();
});

function query(result: unknown) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    offset: () => chain,
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function listContext(profile: unknown[], items: unknown[], total: unknown[]): ServiceContext {
  const select = vi
    .fn()
    .mockImplementationOnce(() => query(profile))
    .mockImplementationOnce(() => query(items))
    .mockImplementationOnce(() => query(total));
  return {
    userId: USER,
    requestId: 'req-notifications',
    db: {
      run: (flow: (tx: unknown) => Promise<unknown>) => flow({ select }),
    } as unknown as UserDatabase,
    clock: new TestClock('2026-11-11T12:20:00Z'),
    logger: {} as never,
  };
}

describe('[SPEC-306] panneau des notifications — mutations', () => {
  it('liste, groupe et compte dans le fuseau du profil (EF-1, ET-1, ET-3)', async () => {
    mocks.count.mockResolvedValue(3);
    const result = await listNotifications(
      listContext(
        [{ timezone: 'Europe/Paris' }],
        [
          {
            id: NOTIFICATION,
            type: 'reminder',
            icon: 'bell',
            title: 'Réviser',
            body: 'Une notion vous attend.',
            href: '/revisions',
            formationTitle: 'SAP',
            createdAt: new Date('2026-11-11T10:00:00Z'),
            readAt: null,
          },
        ],
        [{ total: 5 }],
      ),
      { filter: 'all', limit: 20, offset: 0 },
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        total: 5,
        unreadCount: 3,
        timezone: 'Europe/Paris',
        items: [{ id: NOTIFICATION, group: 'today', readAt: null }],
      },
    });
  });

  it('compte les non-lues sans jamais descendre sous zéro', async () => {
    mocks.count.mockResolvedValueOnce(4).mockResolvedValueOnce(-2);

    await expect(getUnreadNotificationCount(context())).resolves.toEqual({
      ok: true,
      value: { count: 4 },
    });
    await expect(getUnreadNotificationCount(context())).resolves.toEqual({
      ok: true,
      value: { count: 0 },
    });
  });

  it('marque toutes les notifications et renvoie le compte courant', async () => {
    mocks.markAll.mockResolvedValue(undefined);
    mocks.count.mockResolvedValue(1);

    await expect(markAllRead(context())).resolves.toEqual({
      ok: true,
      value: { unreadCount: 1 },
    });
    expect(mocks.markAll).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: USER }),
    );
  });

  it('marque une notification non lue, une seule fois (ET-2)', async () => {
    mocks.get.mockResolvedValue({ readAt: null });
    mocks.mark.mockResolvedValue(undefined);
    mocks.count.mockResolvedValue(2);

    const first = await markNotificationRead(context(), NOTIFICATION);
    expect(first).toEqual({ ok: true, value: { unreadCount: 2 } });
    expect(mocks.mark).toHaveBeenCalledTimes(1);

    mocks.get.mockResolvedValue({ readAt: new Date('2026-11-11T10:00:00Z') });
    mocks.count.mockResolvedValue(2);
    const second = await markNotificationRead(context(), NOTIFICATION);
    expect(second).toEqual({ ok: true, value: { unreadCount: 2 } });
    expect(mocks.mark).toHaveBeenCalledTimes(1);
  });

  it('répond NOT_FOUND pour une notification étrangère (CL-1)', async () => {
    mocks.get.mockResolvedValue(null);
    await expect(markNotificationRead(context(), NOTIFICATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('répond UNAUTHENTICATED sans session', async () => {
    const anonymous = { ...context(), userId: null, db: null };
    await expect(getUnreadNotificationCount(anonymous)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});
