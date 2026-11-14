// Unit tests of the agenda aggregation (SPEC-704 ET-2, ET-5, EF-11; BR-AGE-01, BR-AGE-04,
// BR-AGE-06). The transaction is a fake: no SQL is executed. They pin the local-day projection,
// the filters, the navigation bounds, the period caption and the totals; RLS stays pinned by the
// integration suite.
import { describe, expect, it } from 'vitest';

import type { AgendaSlot } from '@learny/contracts';
import type { DbTx } from '@learny/db';

import { TestClock, sqlText } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { agendaSlotHref, agendaTotals, getAgenda } from './get-agenda';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FORMATION_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FORMATION_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MODULE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTIVITY = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SLOT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const AT = '2026-11-11T12:20:00Z';

type Handler = (text: string) => unknown[] | undefined;

interface FakeTx {
  tx: DbTx;
  calls: string[];
}

function fakeTx(handlers: readonly Handler[]): FakeTx {
  const calls: string[] = [];
  const tx = {
    execute: (query: unknown): Promise<unknown[]> => {
      const text = sqlText(query);
      calls.push(text);
      for (const handler of handlers) {
        const result = handler(text);
        if (result !== undefined) return Promise.resolve(result);
      }
      return Promise.resolve([]);
    },
  };
  return { tx: tx as unknown as DbTx, calls };
}

function context(fake: FakeTx, at: string = AT): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-agenda',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow(fake.tx) } as never,
    clock: new TestClock(at),
    logger: {} as never,
  };
}

function profileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timezone: 'Europe/Paris',
    current_formation_id: FORMATION_A,
    study_days: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

function formationRow(
  id: string,
  title: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title,
    monogram: title.slice(0, 3).toUpperCase(),
    status: 'active',
    start_date: '2026-11-01',
    end_date: '2026-12-31',
    ...overrides,
  };
}

function slotRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SLOT,
    formation_id: FORMATION_A,
    module_id: MODULE,
    module_number: 1,
    kind: 'course',
    title: 'Cours de comptabilité',
    meta: null,
    starts_at: '2026-11-11T15:00:00Z',
    ends_at: '2026-11-11T16:00:00Z',
    status: 'planned',
    activity_id: ACTIVITY,
    group_milestone: false,
    ...overrides,
  };
}

function handlers(options: {
  profile?: Record<string, unknown> | null;
  formations?: Record<string, unknown>[];
  slots?: Record<string, unknown>[];
}): Handler[] {
  const profile = options.profile === undefined ? profileRow() : options.profile;
  return [
    (text) =>
      text.includes('from public.profiles p left join public.study_preferences sp')
        ? profile === null
          ? []
          : [profile]
        : undefined,
    (text) =>
      text.includes('from public.formations f where (f.owner_id')
        ? (options.formations ?? [])
        : undefined,
    (text) =>
      text.includes('from public.schedule_slots ss left join public.modules m')
        ? (options.slots ?? [])
        : undefined,
  ];
}

describe('[SPEC-704] agenda — règles et calculs', () => {
  it('ET-5 — chaque type de créneau pointe vers son écran', () => {
    const base = { formationId: FORMATION_A, date: '2026-11-11' };
    expect(
      agendaSlotHref({ ...base, kind: 'contributions', moduleId: null, activityId: null }),
    ).toBe(`/formations/${FORMATION_A}`);
    expect(
      agendaSlotHref({ ...base, kind: 'contributions', moduleId: MODULE, activityId: null }),
    ).toBe(`/formations/${FORMATION_A}/modules/${MODULE}`);
    expect(agendaSlotHref({ ...base, kind: 'course', moduleId: null, activityId: null })).toBe(
      `/formations/${FORMATION_A}`,
    );
    expect(agendaSlotHref({ ...base, kind: 'course', moduleId: MODULE, activityId: null })).toBe(
      `/formations/${FORMATION_A}/modules/${MODULE}/cours`,
    );
    expect(agendaSlotHref({ ...base, kind: 'exercise', moduleId: null, activityId: null })).toBe(
      `/formations/${FORMATION_A}/programme`,
    );
    expect(agendaSlotHref({ ...base, kind: 'exercise', moduleId: MODULE, activityId: null })).toBe(
      `/formations/${FORMATION_A}/modules/${MODULE}`,
    );
    expect(
      agendaSlotHref({ ...base, kind: 'exercise', moduleId: MODULE, activityId: ACTIVITY }),
    ).toBe(`/formations/${FORMATION_A}/modules/${MODULE}/exercices/${ACTIVITY}`);
    expect(
      agendaSlotHref({ ...base, kind: 'validation_quiz', moduleId: null, activityId: null }),
    ).toBe(`/formations/${FORMATION_A}`);
    expect(
      agendaSlotHref({ ...base, kind: 'validation_quiz', moduleId: MODULE, activityId: null }),
    ).toBe(`/formations/${FORMATION_A}/modules/${MODULE}/quiz`);
    expect(agendaSlotHref({ ...base, kind: 'mock_exam', moduleId: null, activityId: null })).toBe(
      `/formations/${FORMATION_A}/examen-blanc`,
    );
    for (const kind of ['global_quiz', 'revision', 'sprint']) {
      expect(agendaSlotHref({ ...base, kind, moduleId: null, activityId: null })).toBe(
        `/formations/${FORMATION_A}/quiz-global`,
      );
    }
    expect(
      agendaSlotHref({ ...base, kind: 'micro_session', moduleId: null, activityId: null }),
    ).toBe(`/formations/${FORMATION_A}/quiz-global?mode=micro`);
    expect(agendaSlotHref({ ...base, kind: 'warmup', moduleId: null, activityId: null })).toBe(
      '/accueil#echauffement',
    );
    expect(
      agendaSlotHref({ ...base, kind: 'weekly_review', moduleId: null, activityId: null }),
    ).toBe('/accueil#bilan');
    expect(agendaSlotHref({ ...base, kind: 'buffer', moduleId: null, activityId: null })).toBe(
      '/agenda?vue=jour&date=2026-11-11',
    );
    expect(agendaSlotHref({ ...base, kind: 'inconnu', moduleId: null, activityId: null })).toBe(
      `/formations/${FORMATION_A}`,
    );
  });

  it('EF-11 — les totaux excluent les marges et ne comptent que les créneaux terminés', () => {
    function slot(overrides: Partial<AgendaSlot>): AgendaSlot {
      return {
        id: SLOT,
        formationId: FORMATION_A,
        moduleId: null,
        moduleNumber: null,
        kind: 'course',
        typeLabel: 'Cours',
        title: 'Cours',
        meta: null,
        date: '2026-11-11',
        startsAt: '2026-11-11T09:00:00.000Z',
        endsAt: '2026-11-11T10:00:00.000Z',
        startMinutes: 600,
        endMinutes: 660,
        status: 'planned',
        href: '/formations/x',
        activityId: null,
        movable: true,
        ...overrides,
      };
    }
    const totals = agendaTotals([
      slot({}),
      slot({
        status: 'done',
        startsAt: '2026-11-11T10:00:00.000Z',
        endsAt: '2026-11-11T10:30:00.000Z',
      }),
      slot({
        status: 'missed',
        startsAt: '2026-11-11T10:30:00.000Z',
        endsAt: '2026-11-11T10:45:00.000Z',
      }),
      slot({ kind: 'buffer', status: 'planned' }),
      slot({ kind: 'buffer', status: 'done' }),
      slot({ startsAt: '2026-11-11T11:00:00.000Z', endsAt: '2026-11-11T11:00:00.000Z' }),
    ]);
    expect(totals).toEqual({ plannedMinutes: 105, doneMinutes: 30, marginsRemaining: 1 });
  });
});

describe('[SPEC-704] agenda — lecture', () => {
  it('ET-2 — la fenêtre civile est projetée dans le fuseau du profil', async () => {
    const slots = [
      slotRow(),
      slotRow({
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        kind: 'buffer',
        title: 'Marge',
        module_id: null,
        module_number: null,
        status: 'planned',
        starts_at: '2026-11-11T16:00:00Z',
        ends_at: '2026-11-11T16:15:00Z',
      }),
      slotRow({
        id: 'ffffffff-ffff-4fff-8fff-fffffffffff0',
        kind: 'global_quiz',
        title: 'Quiz global',
        status: 'done',
        group_milestone: true,
        starts_at: '2026-11-11T17:00:00Z',
        ends_at: '2026-11-11T17:20:00Z',
      }),
      slotRow({
        id: 'ffffffff-ffff-4fff-8fff-fffffffffff1',
        kind: 'course',
        title: 'Hors fenêtre',
        starts_at: '2026-11-13T09:00:00Z',
        ends_at: '2026-11-13T10:00:00Z',
      }),
    ];
    const fake = fakeTx(
      handlers({
        profile: profileRow({ study_days: [5, '1', 9, 'x', 2] }),
        formations: [formationRow(FORMATION_A, 'Comptabilité')],
        slots,
      }),
    );
    const result = await getAgenda(context(fake), {
      from: '2026-11-10',
      to: '2026-11-11',
      formation: 'all',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      timezone: 'Europe/Paris',
      today: '2026-11-11',
      currentFormationId: FORMATION_A,
      bounds: { start: '2026-11-01', end: '2026-12-31' },
      captionPeriod: { start: '2026-11-01', end: '2026-12-31' },
      studyDays: [1, 2, 5],
      formations: [{ id: FORMATION_A, title: 'Comptabilité', sigle: 'COM', status: 'active' }],
    });
    expect(result.value.slots).toHaveLength(3);
    expect(result.value.slots[0]).toMatchObject({
      kind: 'course',
      date: '2026-11-11',
      startsAt: '2026-11-11T15:00:00.000Z',
      startMinutes: 960,
      endMinutes: 1020,
      href: `/formations/${FORMATION_A}/modules/${MODULE}/cours`,
      movable: true,
    });
    expect(result.value.slots[0]?.typeLabel).toBe('Cours');
    expect(result.value.slots[1]).toMatchObject({ kind: 'buffer', movable: true });
    expect(result.value.slots[2]).toMatchObject({
      kind: 'global_quiz',
      meta: 'Jalon du groupe',
      status: 'done',
      movable: false,
    });
    expect(result.value.totals).toMatchObject({ marginsRemaining: 1 });
  });

  it('EF-1 — le filtre formation restreint les créneaux et la légende', async () => {
    const fake = fakeTx(
      handlers({
        formations: [
          formationRow(FORMATION_A, 'Comptabilité', {
            start_date: '2026-10-01',
            end_date: '2026-12-15',
          }),
          formationRow(FORMATION_B, 'Gestion', {
            start_date: '2026-11-01',
            end_date: '2026-12-31',
          }),
        ],
        slots: [slotRow()],
      }),
    );
    const result = await getAgenda(context(fake), {
      from: '2026-11-10',
      to: '2026-11-11',
      formation: FORMATION_A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formations.map((formation) => formation.id)).toEqual([FORMATION_A]);
    expect(result.value.captionPeriod).toEqual({ start: '2026-10-01', end: '2026-12-15' });
    expect(result.value.slots).toHaveLength(1);
    expect(result.value.slots[0]?.formationId).toBe(FORMATION_A);
  });

  it('EF-1 — une formation étrangère au filtre est un 404', async () => {
    const fake = fakeTx(handlers({ formations: [formationRow(FORMATION_A, 'Comptabilité')] }));
    const result = await getAgenda(context(fake), {
      from: '2026-11-10',
      to: '2026-11-11',
      formation: FORMATION_B,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ET-2 — un profil absent est un 404', async () => {
    const fake = fakeTx(handlers({ profile: null }));
    const result = await getAgenda(context(fake), {
      from: '2026-11-10',
      to: '2026-11-11',
      formation: 'all',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ADR-0183 — sans formation courante, la légende retombe sur les bornes visibles', async () => {
    const fake = fakeTx(
      handlers({
        profile: profileRow({ current_formation_id: null, study_days: null }),
        formations: [
          formationRow(FORMATION_A, 'Comptabilité', { start_date: null, end_date: null }),
          formationRow(FORMATION_B, 'Gestion', { start_date: '2026-12-01', end_date: null }),
        ],
      }),
    );
    const result = await getAgenda(context(fake), {
      from: '2026-11-10',
      to: '2026-11-11',
      formation: 'all',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bounds).toBeNull();
    expect(result.value.captionPeriod).toBeNull();
    expect(result.value.studyDays).toEqual([1, 2, 3, 4, 5]);
  });
});
