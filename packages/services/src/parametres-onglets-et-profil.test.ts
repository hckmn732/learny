// Unit tests of the settings-screen rules (SPEC-707 §12, CA-2, CA-3; ADR-0047 fixed clock).
import { describe, expect, it } from 'vitest';

import type { DbTx } from '@learny/db';

import { TestClock, sqlText } from '../test/support/fakes';

import type { ServiceContext } from './context';
import {
  formatDeletionDeadline,
  getSettingsState,
  parseProfilePatch,
  updateSettingsProfile,
  validationIssue,
} from './parametres-onglets-et-profil';

/** First validation issue of an invalid body, as the API would report it. */
function parseFailure(input: unknown): { path: string; message: string } {
  try {
    parseProfilePatch(input);
  } catch (error) {
    const failure = validationIssue(error);
    if (failure === null) throw error;
    return failure;
  }
  throw new Error('le corps aurait dû être refusé');
}

describe('[SPEC-707] règles et calculs', () => {
  it('CA-2 — le corps de sauvegarde refuse 0 et 7 heures et un rythme vide', () => {
    const days = [1, 2, 3, 4, 5];
    expect(
      parseProfilePatch({
        rhythm: { hoursPerDay: 5, studyDays: days, preferredSlots: ['matin', 'apres_midi'] },
      }),
    ).toEqual({
      rhythm: { hoursPerDay: 5, studyDays: days, preferredSlots: ['matin', 'apres_midi'] },
    });
    for (const hours of [0, 7, 2.5]) {
      expect(() =>
        parseProfilePatch({
          rhythm: { hoursPerDay: hours, studyDays: days, preferredSlots: ['soir'] },
        }),
      ).toThrow(/invalides/);
    }
    // CL-4 — aucun jour ou aucun moment : erreur de champ, aucune sauvegarde partielle.
    expect(() =>
      parseProfilePatch({ rhythm: { hoursPerDay: 5, studyDays: [], preferredSlots: ['soir'] } }),
    ).toThrow(/invalides/);
    expect(() =>
      parseProfilePatch({ rhythm: { hoursPerDay: 5, studyDays: days, preferredSlots: [] } }),
    ).toThrow(/invalides/);
  });

  it('CA-2 — le résumé chiffré du rythme est borné par le contrat partagé', () => {
    // Le libellé exact (« 5 h par jour, 5 jours sur 7, … : 25 h par semaine. ») vient de la
    // fonction partagée de SPEC-602, reprise par l'écran ; ses bornes sont couvertes par le
    // contrat `StudyRhythm` ci-dessus et par les tests e2e `[SPEC-707]`.
    const rhythm = {
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['matin', 'apres_midi'] as const,
    };
    expect(parseProfilePatch({ rhythm })).toEqual({ rhythm });
  });

  it('CA-3 — l’échéance J+30 est formatée dans le fuseau du profil (horloge figée)', () => {
    // 2026-11-11T12:20:00Z + 30 jours, Europe/Paris (UTC+1 en hiver) → 13:20 locales.
    expect(formatDeletionDeadline('2026-12-11T12:20:00.000Z', 'Europe/Paris')).toBe(
      'vendredi 11 décembre à 13:20',
    );
    // BR-ACC-07 — the same instant is rendered in the reader's zone.
    expect(formatDeletionDeadline('2026-12-11T12:20:00.000Z', 'America/Montreal')).toBe(
      'vendredi 11 décembre à 07:20',
    );
  });

  it('CL-1 — un corps hors schéma est refusé avant toute écriture', () => {
    const empty = parseFailure({});
    expect(empty.message).toBe('au moins un champ du profil est attendu');
    expect(parseFailure({ timezone: 'Mars/Olympus' }).message).toMatch(/Fuseau horaire inconnu/);
    expect(parseFailure({ firstName: '' }).message).toMatch(/>=1/);
    expect(parseFailure({ email: 'lire@exemple.fr' }).message).toBe(
      'au moins un champ du profil est attendu',
    );
    expect(parseFailure({ lastName: 'x'.repeat(61) }).message).toMatch(/<=60/);
  });
});

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXPORT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const AT = '2026-11-11T12:20:00Z';

interface FakeDb {
  tx: DbTx;
  updates: Record<string, unknown>[];
  inserted: Record<string, unknown>[];
}

function fakeDb(
  options: {
    me?: Record<string, unknown> | null;
    profile?: Record<string, unknown> | null;
    selects?: readonly unknown[][];
  } = {},
): FakeDb {
  let index = 0;
  const me = options.me === undefined ? meRow() : options.me;
  const profile = options.profile === undefined ? profileRow() : options.profile;
  const updates: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    for: () => selectChain,
    orderBy: () => selectChain,
    limit: () => Promise.resolve((options.selects ?? [])[index++] ?? []),
  };
  const tx = {
    execute: (query: unknown): Promise<unknown[]> => {
      const text = sqlText(query);
      if (text.includes('onboarding_step::text')) return Promise.resolve(me === null ? [] : [me]);
      if (text.includes('active_formation_count')) {
        return Promise.resolve(profile === null ? [] : [profile]);
      }
      return Promise.resolve([]);
    },
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
        return { onConflictDoUpdate: () => Promise.resolve([]) };
      },
    }),
  };
  return { tx: tx as unknown as DbTx, updates, inserted };
}

function meRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER,
    email: 'alex@test.learny.test',
    first_name: 'Alex',
    last_name: 'Martin',
    tutor_tone: 'tu',
    course_language: 'fr',
    timezone: 'Europe/Paris',
    onboarding_step: 'done',
    onboarding_completed_at: '2026-11-01T10:00:00Z',
    current_formation_id: null,
    ...overrides,
  };
}

function profileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    updated_at: new Date('2026-11-11T10:00:00Z'),
    created_at: new Date('2026-10-01T10:00:00Z'),
    deletion_scheduled_for: null,
    active_formation_count: 2,
    ...overrides,
  };
}

function rhythmRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hoursPerDay: 5,
    studyDays: [1, 2, 3, 4, 5],
    preferredSlots: ['matin', 'apres_midi'],
    ...overrides,
  };
}

function exportRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: EXPORT,
    status: 'done',
    sizeBytes: 12_345,
    createdAt: new Date('2026-11-10T10:00:00Z'),
    expiresAt: new Date('2026-11-17T10:00:00Z'),
    ...overrides,
  };
}

function context(fake: FakeDb): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-settings',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow(fake.tx) } as never,
    clock: new TestClock(AT),
    logger: {} as never,
  };
}

describe('[SPEC-707] état de l’écran Paramètres', () => {
  it('EF-2, EF-4 — lit le profil, le rythme, les dates et le dernier export', async () => {
    const fake = fakeDb({
      profile: profileRow({ deletion_scheduled_for: new Date('2026-12-11T12:20:00Z') }),
      selects: [[rhythmRow()], [exportRow()]],
    });
    const result = await getSettingsState(context(fake));
    expect(result).toMatchObject({
      ok: true,
      value: {
        me: { id: USER, firstName: 'Alex', timezone: 'Europe/Paris' },
        rhythm: {
          hoursPerDay: 5,
          studyDays: [1, 2, 3, 4, 5],
          preferredSlots: ['matin', 'apres_midi'],
        },
        updatedAt: '2026-11-11T10:00:00.000Z',
        createdAt: '2026-10-01T10:00:00.000Z',
        activeFormationCount: 2,
        deletionScheduledFor: '2026-12-11T12:20:00.000Z',
        export: {
          id: EXPORT,
          status: 'done',
          sizeBytes: 12_345,
          createdAt: '2026-11-10T10:00:00.000Z',
          expiresAt: '2026-11-17T10:00:00.000Z',
        },
      },
    });
  });

  it('BR-ACC-10 — aucun export demandé rend null', async () => {
    const fake = fakeDb({ selects: [[rhythmRow()], []] });
    const result = await getSettingsState(context(fake));
    expect(result).toMatchObject({ ok: true, value: { export: null, deletionScheduledFor: null } });
  });

  it('CL-1 — des préférences absentes sont un 404', async () => {
    const fake = fakeDb({ selects: [[]] });
    const result = await getSettingsState(context(fake));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('EF-2 — un profil absent est un 404', async () => {
    const fake = fakeDb({ me: null });
    const result = await getSettingsState(context(fake));
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});

describe('[SPEC-707] sauvegarde du profil et du rythme', () => {
  it('CL-1 — un corps invalide est refusé sans transaction', async () => {
    const fake = fakeDb();
    const result = await updateSettingsProfile(context(fake), {});
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(fake.updates).toHaveLength(0);
  });

  it('CL-2 — une version périmée est un 409 sans écriture', async () => {
    const fake = fakeDb({ selects: [[{ updatedAt: new Date('2026-11-11T10:00:00Z') }]] });
    const result = await updateSettingsProfile(context(fake), {
      firstName: 'Alexandre',
      expectedUpdatedAt: '2026-11-11T09:00:00.000Z',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', status: 409 } });
    expect(fake.updates).toHaveLength(0);
  });

  it('CL-2 — un profil absent est un 404', async () => {
    const fake = fakeDb({ selects: [[]] });
    const result = await updateSettingsProfile(context(fake), { firstName: 'Alexandre' });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ET-3 — le profil et le rythme sont écrits en une transaction', async () => {
    const fake = fakeDb({
      selects: [
        [{ updatedAt: new Date('2026-11-11T10:00:00Z') }],
        [rhythmRow({ hoursPerDay: 4, studyDays: [1, 3, 5], preferredSlots: ['soir'] })],
        [exportRow()],
      ],
    });
    const result = await updateSettingsProfile(context(fake), {
      firstName: 'Alexandre',
      tutorTone: 'vous',
      timezone: 'Europe/Paris',
      rhythm: {
        hoursPerDay: 4,
        studyDays: [1, 3, 5],
        preferredSlots: ['soir'],
      },
      expectedUpdatedAt: '2026-11-11T10:00:00.000Z',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { rhythm: { hoursPerDay: 4, studyDays: [1, 3, 5], preferredSlots: ['soir'] } },
    });
    expect(fake.updates[0]).toEqual({
      firstName: 'Alexandre',
      tutorTone: 'vous',
      timezone: 'Europe/Paris',
      updatedAt: new Date(AT),
    });
    expect(fake.inserted[0]).toMatchObject({
      userId: USER,
      hoursPerDay: 4,
      studyDays: [1, 3, 5],
      preferredSlots: ['soir'],
      updatedAt: new Date(AT),
    });
  });
});
