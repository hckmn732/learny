// Unit tests of the Notifications tab of the settings screen (SPEC-708 EF-1 to EF-4, ET-1 to ET-5;
// BR-SET-03, BR-NOT-04). The transaction is a fake Drizzle client: no SQL is executed. They pin the
// normalisation of the stored row, the partial patch, the optimistic version, the test notification
// decided at the injected clock and the next digest slot in the profile zone.
import { describe, expect, it } from 'vitest';

import type { NotificationSettingsDto } from '@learny/contracts';
import type { DbTx } from '@learny/db';

import { TestClock } from '../test/support/fakes';

import type { ServiceContext } from './context';
import {
  activeNotificationTypeCount,
  decideTestNotification,
  getNotificationSettings,
  nextDigestAt,
  notificationSettingsToDelivery,
  notificationSettingsToDto,
  parseNotificationSettingsPatch,
  previewTestNotification,
  quietHoursOf,
  updateNotificationSettings,
} from './parametres-notifications';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AT = '2026-11-11T12:20:00Z';

interface FakeDb {
  tx: DbTx;
  updates: Record<string, unknown>[];
  inserted: Record<string, unknown>[];
}

/** Fake Drizzle client: `selects` is the queue of rows returned by each `select…limit()` chain. */
function fakeDb(selects: readonly unknown[][]): FakeDb {
  let index = 0;
  const updates: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    for: () => selectChain,
    orderBy: () => selectChain,
    limit: () => Promise.resolve(selects[index++] ?? []),
  };
  const tx = {
    select: () => selectChain,
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Promise.resolve([]) };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        inserted.push(values);
        return { onConflictDoNothing: () => Promise.resolve([]) };
      },
    }),
  };
  return { tx: tx as unknown as DbTx, updates, inserted };
}

function context(fake: FakeDb): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-notifications',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow(fake.tx) } as never,
    clock: new TestClock(AT),
    logger: {} as never,
  };
}

function settingsRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId: USER,
    channelEmail: true,
    channelPush: false,
    typeRevision: true,
    typeValidation: true,
    typeCourse: false,
    typeGap: true,
    typePlanning: false,
    typeRelaunch: true,
    digestTime: '08:00:00',
    quietStart: '21:00:00',
    quietEnd: '08:00:00',
    weekendQuiet: true,
    maxPerDay: 5,
    updatedAt: new Date('2026-11-11T10:00:00Z'),
    ...overrides,
  };
}

function dto(overrides: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    channels: { app: true, email: true, browser: false },
    types: {
      revision: true,
      validation: true,
      course: false,
      gap: true,
      planning: false,
      relaunch: true,
    },
    digestTime: '08:00',
    quiet: { start: '21:00', end: '08:00', crossesMidnight: true, empty: false },
    weekendQuiet: true,
    maxPerDay: 5,
    activeTypeCount: 4,
    updatedAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('[SPEC-708] réglages de notifications — règles et calculs', () => {
  it('ET-3, CL-1 — un patch hors schéma est refusé avant toute écriture', () => {
    expect(parseNotificationSettingsPatch({ weekendQuiet: false })).toEqual({
      weekendQuiet: false,
    });
    expect(() => parseNotificationSettingsPatch({})).toThrow(/invalides/);
    expect(() => parseNotificationSettingsPatch({ channels: {} })).toThrow(/invalides/);
    expect(() => parseNotificationSettingsPatch({ maxPerDay: 4 })).toThrow(/invalides/);
    expect(() => parseNotificationSettingsPatch({ digestTime: '8:00' })).toThrow(/invalides/);
  });

  it('CA-1 — le compteur des six interrupteurs compte les types activés', () => {
    expect(
      activeNotificationTypeCount({
        revision: true,
        validation: false,
        course: true,
        gap: false,
        planning: true,
        relaunch: true,
      }),
    ).toBe(4);
  });

  it('ET-4, CL-5 — la plage de silence traverse minuit ou reste vide', () => {
    expect(quietHoursOf('21:00:00', '08:00:00')).toEqual({
      start: '21:00',
      end: '08:00',
      crossesMidnight: true,
      empty: false,
    });
    expect(quietHoursOf('08:00:00', '21:00:00')).toEqual({
      start: '08:00',
      end: '21:00',
      crossesMidnight: false,
      empty: false,
    });
    expect(quietHoursOf('08:00:00', '08:00:00')).toEqual({
      start: '08:00',
      end: '08:00',
      crossesMidnight: false,
      empty: true,
    });
  });

  it('ET-3 — la ligne stockée est normalisée pour l’écran', () => {
    expect(notificationSettingsToDto(settingsRow() as never)).toEqual(dto());
  });

  it('ET-3 — une ligne incohérente est une erreur interne, jamais un DTO inventé', () => {
    expect(() => notificationSettingsToDto(settingsRow({ maxPerDay: 4 }) as never)).toThrow(
      /incohérents/,
    );
  });

  it('EF-2 — les réglages sont projetés dans la forme du routeur de SPEC-209', () => {
    expect(notificationSettingsToDelivery(dto())).toEqual({
      channelEmail: true,
      channelPush: false,
      typeRevision: true,
      typeValidation: true,
      typeCourse: false,
      typeGap: true,
      typePlanning: false,
      typeRelaunch: true,
      quietStart: '21:00',
      quietEnd: '08:00',
      weekendQuiet: true,
      maxPerDay: 5,
    });
  });

  it('CA-3 — une notification de test est décidée par le routeur partagé', () => {
    expect(decideTestNotification(dto(), new Date(AT), 'Europe/Paris')).toEqual({
      status: 'sent',
      scheduledFor: null,
    });
    const disabled = dto({
      types: {
        revision: true,
        validation: true,
        course: true,
        gap: true,
        planning: true,
        relaunch: false,
      },
    });
    expect(decideTestNotification(disabled, new Date(AT), 'Europe/Paris').status).toBe(
      'skipped_pref',
    );
  });

  it('EF-3 — l’heure déjà passée est reportée au lendemain dans le fuseau du profil', () => {
    expect(nextDigestAt('09:00', new Date(AT), 'Europe/Paris').toISOString()).toBe(
      '2026-11-12T08:00:00.000Z',
    );
    expect(nextDigestAt('15:00', new Date(AT), 'Europe/Paris').toISOString()).toBe(
      '2026-11-11T14:00:00.000Z',
    );
  });
});

describe('[SPEC-708] réglages de notifications — service', () => {
  it('CL-1 — un profil absent est un 404', async () => {
    const fake = fakeDb([[]]);
    const result = await getNotificationSettings(context(fake));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ET-3 — la lecture renvoie les réglages normalisés', async () => {
    const fake = fakeDb([[{ id: USER }], [settingsRow()]]);
    const result = await getNotificationSettings(context(fake));
    expect(result).toMatchObject({ ok: true, value: { activeTypeCount: 4, maxPerDay: 5 } });
  });

  it('BR-NOT-04 — une ligne manquante reçoit les valeurs par défaut', async () => {
    const fake = fakeDb([[{ id: USER }], [], [settingsRow()]]);
    const result = await getNotificationSettings(context(fake));
    expect(result.ok).toBe(true);
    expect(fake.inserted).toEqual([{ userId: USER }]);
  });

  it('ET-3 — un patch invalide est refusé sans transaction', async () => {
    const fake = fakeDb([]);
    const result = await updateNotificationSettings(context(fake), { maxPerDay: 4 });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(fake.updates).toHaveLength(0);
  });

  it('CL-2 — une version périmée est un 409 sans écriture', async () => {
    const fake = fakeDb([[{ id: USER }], [settingsRow()]]);
    const result = await updateNotificationSettings(context(fake), {
      weekendQuiet: false,
      expectedUpdatedAt: '2026-11-11T09:00:00.000Z',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', status: 409 } });
    expect(fake.updates).toHaveLength(0);
  });

  it('ET-3 — un patch partiel n’écrit que les champs fournis', async () => {
    const updated = settingsRow({ weekendQuiet: false, maxPerDay: 3 });
    const fake = fakeDb([[{ id: USER }], [settingsRow()], [updated]]);
    const result = await updateNotificationSettings(context(fake), {
      weekendQuiet: false,
      maxPerDay: 3,
      expectedUpdatedAt: '2026-11-11T10:00:00.000Z',
    });
    expect(result).toMatchObject({ ok: true, value: { weekendQuiet: false, maxPerDay: 3 } });
    expect(fake.updates).toHaveLength(1);
    expect(fake.updates[0]).toEqual({
      weekendQuiet: false,
      maxPerDay: 3,
      updatedAt: new Date(AT),
    });
  });

  it('BR-NOT-04 — un patch sur une ligne manquante la crée puis l’applique', async () => {
    const fake = fakeDb([
      [{ id: USER }],
      [],
      [settingsRow()],
      [settingsRow({ channelEmail: false })],
    ]);
    const result = await updateNotificationSettings(context(fake), {
      channels: { email: false },
    });
    expect(result).toMatchObject({ ok: true, value: { channels: { email: false } } });
    expect(fake.inserted).toEqual([{ userId: USER }]);
    expect(fake.updates[0]).toMatchObject({ channelEmail: false });
  });

  it('CA-3 — l’aperçu de notification lit le profil et les réglages', async () => {
    const fake = fakeDb([[{ timezone: 'Europe/Paris' }], [settingsRow()]]);
    const result = await previewTestNotification(context(fake));
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'sent',
        scheduledFor: null,
        digestAt: '2026-11-12T07:00:00.000Z',
        timezone: 'Europe/Paris',
      },
    });
  });

  it('EF-3 — l’aperçu d’un profil absent est un 404', async () => {
    const fake = fakeDb([[]]);
    const result = await previewTestNotification(context(fake));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
