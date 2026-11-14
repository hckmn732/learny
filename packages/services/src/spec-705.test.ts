// Unit tests of the agenda move and BR-FOR-14 replanning (SPEC-705 EF-1 to EF-4, ET-1 to ET-5;
// BR-AGE-05, BR-FOR-14; ADR-0326). The transaction is a fake and the planner is partially mocked:
// `findCompatibleSlots` stays real for the alternative mapping, `planSchedule`, the automation
// journal, the reconciliation and the event emitter are observed. RLS stays pinned by the
// integration suite.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTx } from '@learny/db';
import type { PlanResult, ReplanOption } from '@learny/learning-engine';

import { TestClock, sqlText } from '../test/support/fakes';

import {
  applyReplan,
  blockedModuleOf,
  currentPlanVersion,
  getReplanOptions,
  getSlotAlternatives,
  moveSlot,
  normalizeOptions,
  planInputOf,
  planVersionOf,
  previewOptionsOf,
  readPlanningContext,
  slotVersionOf,
  type PlanningContext,
} from './agenda-deplacer-et-reajuster-le-planning';
import type { ServiceContext } from './context';

const mocks = vi.hoisted(() => ({
  planSchedule: vi.fn(),
  getAgenda: vi.fn(),
  createAction: vi.fn(),
  reconcile: vi.fn(),
  emit: vi.fn(),
  serviceDb: {
    transaction: (flow: (tx: unknown) => Promise<unknown>) => flow(serviceTx),
  },
}));
const serviceTx = {} as never;

vi.mock('@learny/learning-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learny/learning-engine')>();
  return { ...actual, planSchedule: mocks.planSchedule };
});
vi.mock('@learny/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learny/db')>();
  return { ...actual, serviceDb: () => mocks.serviceDb };
});
vi.mock('./agenda/get-agenda', () => ({ getAgenda: mocks.getAgenda }));
vi.mock('./automations', () => ({
  createAutomationActionQuiet: mocks.createAction,
}));
vi.mock('./learning/persist-plan', () => ({ reconcilePlanSlots: mocks.reconcile }));
vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FORMATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MODULE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NEW_SLOT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ACTION = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const AT = '2026-11-11T12:20:00Z';

type Handler = (text: string) => unknown[] | undefined;

interface FakeDb {
  tx: DbTx;
  calls: string[];
}

function fakeTx(handlers: readonly Handler[]): FakeDb {
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

function context(fake: FakeDb, at: string = AT): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-spec-705',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow(fake.tx) } as never,
    clock: new TestClock(at),
    logger: {} as never,
  };
}

function profileRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timezone: 'Europe/Paris',
    hours_per_day: 5,
    study_days: [1, 2, 3, 4, 5],
    preferred_slots: ['matin', 'apres_midi'],
    ...overrides,
  };
}

function formationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    status: 'active',
    start_date: '2026-11-02',
    end_date: '2026-11-30',
    volume_hours: 20,
    objectives: ['operational', 'exam'],
    ...overrides,
  };
}

function moduleRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    module_id: MODULE,
    formation_id: FORMATION,
    position: 3,
    title: 'Comptabilité générale',
    status: 'open',
    planned_start: '2026-11-09',
    planned_end: '2026-11-13',
    chapter_id: '11111111-1111-4111-8111-111111111111',
    chapter_position: 1,
    chapter_title: 'Plan comptable',
    ...overrides,
  };
}

function slotRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SLOT,
    formation_id: FORMATION,
    module_id: MODULE,
    kind: 'validation_quiz',
    title: 'Quiz de validation',
    meta: 'Tentative 2 · seuil 80 %',
    starts_at: '2026-11-11T14:00:00Z',
    ends_at: '2026-11-11T15:00:00Z',
    status: 'planned',
    activity_id: null,
    created_by: 'planner',
    moved_from_id: null,
    group_milestone: false,
    ...overrides,
  };
}

function handlers(
  options: {
    profile?: Record<string, unknown> | null;
    formation?: Record<string, unknown> | null;
    modules?: readonly Record<string, unknown>[];
    slots?: readonly Record<string, unknown>[];
    overlap?: readonly Record<string, unknown>[];
    successor?: readonly Record<string, unknown>[];
  } = {},
): Handler[] {
  const profile = options.profile === undefined ? profileRow() : options.profile;
  return [
    (text) =>
      text.includes('select timezone from public.profiles where id')
        ? [{ timezone: 'Europe/Paris' }]
        : undefined,
    (text) =>
      text.includes('from public.profiles p') ? (profile === null ? [] : [profile]) : undefined,
    (text) =>
      text.includes('from public.formations f')
        ? options.formation === null
          ? []
          : [options.formation ?? formationRow()]
        : undefined,
    (text) =>
      text.includes('from public.modules m') ? [...(options.modules ?? [moduleRow()])] : undefined,
    (text) =>
      text.includes('from public.schedule_slots ss')
        ? [...(options.slots ?? [slotRow()])]
        : undefined,
    (text) =>
      text.includes('from public.schedule_slots where user_id')
        ? [...(options.overlap ?? [])]
        : undefined,
    (text) =>
      text.includes('where moved_from_id =')
        ? [...(options.successor ?? [{ id: NEW_SLOT }])]
        : undefined,
    (text) => (text.startsWith('update public.schedule_slots') ? [] : undefined),
    (text) =>
      text.startsWith('insert into public.schedule_slots') ? [{ id: NEW_SLOT }] : undefined,
    (text) => (text.startsWith('update public.formations') ? [] : undefined),
    (text) => (text.startsWith('update public.study_preferences') ? [] : undefined),
    (text) => (text.includes('pg_advisory_xact_lock') ? [] : undefined),
  ];
}

function planResult(overrides: Partial<PlanResult> = {}): PlanResult {
  return {
    slots: [],
    conflicts: [],
    remainingCapacity: [],
    options: [],
    deadlines: [
      {
        formationId: FORMATION,
        endDate: '2026-11-30',
        projectedEndDate: '2026-11-30',
        missed: false,
        blockedModules: [MODULE],
      },
    ],
    unscheduled: [],
    ...overrides,
  };
}

function learningOption(overrides: Partial<ReplanOption> = {}): ReplanOption {
  return {
    formationId: FORMATION,
    kind: 'shift_end',
    feasible: true,
    reason: null,
    currentEndDate: '2026-11-30',
    projectedEndDate: '2026-12-02',
    extraDays: 2,
    currentHoursPerDay: 5,
    newHoursPerDay: null,
    removedMinutes: null,
    ...overrides,
  };
}

function threePlannerOptions(): ReplanOption[] {
  return [
    learningOption(),
    learningOption({
      kind: 'increase_volume',
      projectedEndDate: null,
      extraDays: null,
      newHoursPerDay: 6,
    }),
    learningOption({
      kind: 'lighten',
      projectedEndDate: '2026-11-30',
      extraDays: null,
      removedMinutes: 129,
    }),
  ];
}

function agendaDto(slotId = SLOT): Record<string, unknown> {
  return {
    timezone: 'Europe/Paris',
    today: '2026-11-11',
    currentFormationId: FORMATION,
    bounds: { start: '2026-11-02', end: '2026-11-30' },
    captionPeriod: { start: '2026-11-02', end: '2026-11-30' },
    studyDays: [1, 2, 3, 4, 5],
    formations: [{ id: FORMATION, title: 'SAP', sigle: 'SAP', status: 'active' }],
    slots: [
      {
        id: slotId,
        formationId: FORMATION,
        moduleId: MODULE,
        moduleNumber: 3,
        kind: 'validation_quiz',
        typeLabel: 'Quiz de validation',
        title: 'Quiz de validation',
        meta: null,
        date: '2026-11-13',
        startsAt: '2026-11-13T09:00:00.000Z',
        endsAt: '2026-11-13T10:00:00.000Z',
        startMinutes: 600,
        endMinutes: 660,
        status: 'planned',
        href: `/formations/${FORMATION}/modules/${MODULE}/quiz`,
        activityId: null,
        movable: true,
      },
    ],
    totals: { plannedMinutes: 60, doneMinutes: 0, marginsRemaining: 0 },
    blockedModule: null,
  };
}

function planningContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  return {
    profile: profileRow() as unknown as PlanningContext['profile'],
    formation: formationRow() as unknown as PlanningContext['formation'],
    modules: [moduleRow()] as unknown as PlanningContext['modules'],
    slots: [slotRow()] as unknown as PlanningContext['slots'],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.planSchedule.mockReset().mockReturnValue(planResult());
  mocks.getAgenda.mockReset().mockImplementation(() => ({
    ok: true,
    value: agendaDto(NEW_SLOT),
  }));
  mocks.createAction.mockReset().mockResolvedValue({
    action: { id: ACTION, summary: 'explication', status: 'applied' },
    created: true,
  });
  mocks.reconcile.mockReset().mockResolvedValue({
    created: 1,
    updated: 0,
    unchanged: 0,
    cancelled: 0,
    preserved: 2,
  });
  mocks.emit.mockReset().mockResolvedValue(undefined);
});

describe('[SPEC-705] règles et calculs', () => {
  it('ET-3 — la version d’un créneau change avec ses horaires et son statut', () => {
    const base = slotVersionOf(slotRow() as never);
    expect(base).toMatch(/^slot-[0-9a-f]{16}$/);
    expect(slotVersionOf(slotRow() as never)).toBe(base);
    expect(slotVersionOf(slotRow({ starts_at: '2026-11-11T16:00:00Z' }) as never)).not.toBe(base);
    expect(slotVersionOf(slotRow({ status: 'done' }) as never)).not.toBe(base);
  });

  it('ET-4 — la version de plan est stable, ordonnée et sensible à la fin et au rythme', () => {
    const parts = {
      formation: formationRow() as never,
      modules: [moduleRow() as never],
      slots: [slotRow() as never],
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
    };
    const version = planVersionOf(parts);
    expect(version).toMatch(/^plan-[0-9a-f]{16}$/);
    expect(planVersionOf({ ...parts, studyDays: [5, 4, 3, 2, 1], slots: [...parts.slots] })).toBe(
      version,
    );
    expect(planVersionOf({ ...parts, hoursPerDay: 6 })).not.toBe(version);
    expect(
      planVersionOf({
        ...parts,
        formation: formationRow({ end_date: '2026-12-05' }) as never,
      }),
    ).not.toBe(version);
    expect(currentPlanVersion(planningContext())).toBe(
      planVersionOf({
        formation: planningContext().formation,
        modules: planningContext().modules,
        slots: planningContext().slots,
        hoursPerDay: 5,
        studyDays: [1, 2, 3, 4, 5],
      }),
    );
  });

  it('ET-5 — l’entrée du planificateur reprend le rythme, les jours et les dates du module', () => {
    const input = planInputOf(planningContext(), new Date(AT));
    expect(input.now).toBe('2026-11-11T12:20:00.000Z');
    expect(input.preferences.tz).toBe('Europe/Paris');
    expect(input.preferences.availability).toMatchObject({
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
      preferredSlots: ['matin', 'apres_midi'],
    });
    expect(input.formations[0]).toMatchObject({
      formationId: FORMATION,
      endDate: '2026-11-30',
      modules: [{ moduleId: MODULE, deadline: '2026-11-13', hours: 20 }],
    });
    const overridden = planInputOf(planningContext(), new Date(AT), {
      endDate: '2026-12-15',
      hoursPerDay: 6,
    });
    expect(overridden.formations[0]?.endDate).toBe('2026-12-15');
    expect(overridden.preferences.availability.hoursPerDay).toBe(6);
    const fallback = planInputOf(
      planningContext({
        profile: profileRow({ study_days: [], hours_per_day: null }) as never,
        formation: formationRow({ end_date: null, volume_hours: null }) as never,
        modules: [],
        slots: [],
      }),
      new Date(AT),
    );
    expect(fallback.preferences.availability.hoursPerDay).toBe(2);
    expect(fallback.formations[0]?.endDate).toBe('2027-03-11');
  });

  it('EF-2 — détecte un quiz échoué sans marge restante et un module validé n’est jamais bloqué', () => {
    const today = '2026-11-11';
    const now = new Date(AT);
    expect(
      blockedModuleOf({
        modules: [moduleRow() as never],
        slots: [slotRow({ status: 'missed' }) as never],
        today,
        now,
      }),
    ).toMatchObject({ moduleId: MODULE, reason: 'quiz_failed' });
    expect(
      blockedModuleOf({
        modules: [moduleRow() as never],
        slots: [
          slotRow({ status: 'missed' }) as never,
          slotRow({ kind: 'buffer', starts_at: '2026-11-12T14:00:00Z' }) as never,
        ],
        today,
        now,
      }),
    ).toBeNull();
    expect(
      blockedModuleOf({
        modules: [moduleRow({ status: 'validated' }) as never],
        slots: [],
        today,
        now,
      }),
    ).toBeNull();
    expect(
      blockedModuleOf({
        modules: [moduleRow({ planned_end: '2026-11-06' }) as never],
        slots: [],
        today,
        now,
      }),
    ).toMatchObject({ reason: 'delayed' });
    expect(
      blockedModuleOf({
        modules: [moduleRow({ planned_end: '2026-11-10' }) as never],
        slots: [],
        today,
        now,
      }),
    ).toBeNull();
  });

  it('EF-2 — recompose toujours trois options dans l’ordre attendu', () => {
    const options = normalizeOptions([
      {
        kind: 'lighten',
        feasible: true,
        reason: null,
        currentEndDate: '2026-11-30',
        projectedEndDate: '2026-11-30',
        extraDays: null,
        currentHoursPerDay: 5,
        newHoursPerDay: null,
        removedMinutes: 120,
      },
    ]);
    expect(options.map((option) => option.kind)).toEqual([
      'shift_end',
      'increase_volume',
      'lighten',
    ]);
    expect(options[0]?.feasible).toBe(false);
    expect(options[2]?.removedMinutes).toBe(120);
  });

  it('EF-2 — l’aperçu de secours projette la fin, le volume et l’allègement', () => {
    const preview = previewOptionsOf(
      planningContext({
        formation: formationRow({ end_date: '2026-11-20', volume_hours: 20 }) as never,
      }),
      planResult({
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-20',
            projectedEndDate: '2026-11-23',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
      new Date(AT),
      5,
    );
    expect(preview[0]).toMatchObject({ kind: 'shift_end', feasible: true, extraDays: 3 });
    expect(preview[0]?.projectedEndDate).toBe('2026-11-23');
    expect(preview[1]).toMatchObject({ kind: 'increase_volume', newHoursPerDay: 6 });
    expect(preview[2]).toMatchObject({ kind: 'lighten', removedMinutes: 120 });
  });

  it('EF-1 — renvoie exactement trois alternatives triées avec leurs raisons (CA-1)', async () => {
    const fake = fakeTx(handlers({ slots: [slotRow()] }));
    const result = await getSlotAlternatives(context(fake), SLOT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.slotId).toBe(SLOT);
    expect(result.value.version).toMatch(/^slot-/);
    expect(result.value.durationMinutes).toBe(60);
    expect(result.value.timezone).toBe('Europe/Paris');
    expect(result.value.alternatives).toHaveLength(3);
    const dates = result.value.alternatives.map((alternative) => alternative.startsAt);
    expect([...dates].sort()).toEqual(dates);
    expect(result.value.alternatives[0]?.reasons).toContain('Jour d’étude');
    expect(result.value.alternatives[0]?.startMinutes).toBeGreaterThanOrEqual(0);
  });

  it('EF-1 — aucune alternative dans les dates de la formation (CL-3)', async () => {
    const fake = fakeTx(
      handlers({
        slots: [slotRow()],
        formation: formationRow({ end_date: '2026-11-10' }),
      }),
    );
    const result = await getSlotAlternatives(context(fake), SLOT);
    expect(result).toMatchObject({ ok: true, value: { alternatives: [] } });
  });

  it('EF-1 — un créneau inconnu, passé, déplacé ou sans formation est refusé', async () => {
    const cases: { options: Parameters<typeof handlers>[0]; code: string }[] = [
      { options: { slots: [] }, code: 'NOT_FOUND' },
      { options: { slots: [slotRow({ starts_at: '2026-11-10T10:00:00Z' })] }, code: 'CONFLICT' },
      { options: { slots: [slotRow({ status: 'done' })] }, code: 'CONFLICT' },
      { options: { slots: [slotRow({ formation_id: null })] }, code: 'CONFLICT' },
    ];
    for (const testCase of cases) {
      const result = await getSlotAlternatives(context(fakeTx(handlers(testCase.options))), SLOT);
      expect(result).toMatchObject({ ok: false, error: { code: testCase.code } });
    }
    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(getSlotAlternatives(anonymous, SLOT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('EF-1 — le déplacement crée un créneau, marque l’ancien et renvoie l’agenda (CA-1)', async () => {
    const fake = fakeTx(handlers({ slots: [slotRow()] }));
    const expectedVersion = slotVersionOf(slotRow() as never);
    mocks.createAction.mockImplementation(() =>
      Promise.resolve({
        action: { id: ACTION, summary: 'Activité déplacée.', status: 'applied' },
        created: true,
      }),
    );
    const result = await moveSlot(context(fake), SLOT, {
      expectedVersion,
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T10:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.replacedSlotId).toBe(SLOT);
    expect(result.value.movedSlot.id).not.toBe(SLOT);
    expect(result.value.explanation).toContain('Activité déplacée');
    expect(fake.calls.some((text) => text.startsWith('update public.schedule_slots'))).toBe(true);
    expect(fake.calls.some((text) => text.startsWith('insert into public.schedule_slots'))).toBe(
      true,
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'agenda/slot-moved',
      expect.objectContaining({ slotId: SLOT }),
      expect.anything(),
    );
  });

  it('EF-1 — une durée différente, une version obsolète ou un chevauchement refusent le déplacement (CL-1, CL-2, CL-4)', async () => {
    const expectedVersion = slotVersionOf(slotRow() as never);
    const duration = await moveSlot(context(fakeTx(handlers())), SLOT, {
      expectedVersion,
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T10:30:00.000Z',
    });
    expect(duration).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const stale = await moveSlot(context(fakeTx(handlers())), SLOT, {
      expectedVersion: 'slot-0000000000000000',
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T10:00:00.000Z',
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    const overlap = await moveSlot(
      context(fakeTx(handlers({ overlap: [{ id: 'autre' }] }))),
      SLOT,
      {
        expectedVersion,
        startsAt: '2026-11-13T09:00:00.000Z',
        endsAt: '2026-11-13T10:00:00.000Z',
      },
    );
    expect(overlap).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('EF-1 — un rejeu sur un créneau déjà déplacé renvoie son successeur (CA-3)', async () => {
    const movedRow = slotRow({ status: 'moved' });
    const expectedVersion = slotVersionOf({ ...movedRow, status: 'planned' } as never);
    const fake = fakeTx(handlers({ slots: [movedRow] }));
    const result = await moveSlot(context(fake), SLOT, {
      expectedVersion,
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T10:00:00.000Z',
    });
    expect(result).toMatchObject({ ok: true, value: { movedSlot: { id: NEW_SLOT } } });
    expect(fake.calls.some((text) => text.startsWith('update public.schedule_slots'))).toBe(false);
    expect(mocks.createAction).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('EF-2 — les options n’écrivent rien et exposent la version du plan (CA-2)', async () => {
    mocks.planSchedule.mockReturnValue(
      planResult({
        options: threePlannerOptions(),
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-12-02',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
    );
    const fake = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-06' })] }));
    const result = await getReplanOptions(context(fake), FORMATION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.options).toHaveLength(3);
    expect(result.value.planVersion).toMatch(/^plan-/);
    expect(result.value.blocked).toMatchObject({ moduleId: MODULE });
    expect(fake.calls.some((text) => text.startsWith('insert') || text.startsWith('update'))).toBe(
      false,
    );
  });

  it('EF-2 — aucune option quand aucun module n’est bloqué', async () => {
    mocks.planSchedule.mockReturnValue(
      planResult({
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-11-30',
            missed: false,
            blockedModules: [],
          },
        ],
      }),
    );
    const result = await getReplanOptions(
      context(fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-20' })] }))),
      FORMATION,
    );
    expect(result).toMatchObject({ ok: true, value: { blocked: null, options: [] } });
  });

  it('EF-3 — applique le décalage de fin et replanifie les créneaux futurs (CA-2)', async () => {
    mocks.planSchedule.mockReturnValue(
      planResult({
        options: threePlannerOptions(),
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-12-02',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
    );
    const fake = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-06' })] }));
    const planVersion = currentPlanVersion(
      await readPlanningContext(fake.tx, USER, FORMATION, new Date(AT)),
    );
    const result = await applyReplan(context(fake), FORMATION, {
      choice: 'shift_end',
      expectedPlanVersion: planVersion,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'applied', endDate: '2026-12-02', hoursPerDay: 5 },
    });
    expect(fake.calls.some((text) => text.startsWith('update public.formations'))).toBe(true);
    expect(mocks.reconcile).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'plan/replanned',
      expect.objectContaining({ formationId: FORMATION, choice: 'shift_end' }),
      expect.anything(),
    );
  });

  it('EF-3 — applique le volume quotidien et laisse le plan inchangé sans choix (CA-2, CL-5)', async () => {
    mocks.planSchedule.mockReturnValue(
      planResult({
        options: threePlannerOptions(),
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-12-02',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
    );
    const fake = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-06' })] }));
    const planVersion = currentPlanVersion(
      await readPlanningContext(fake.tx, USER, FORMATION, new Date(AT)),
    );
    const result = await applyReplan(context(fake), FORMATION, {
      choice: 'increase_volume',
      expectedPlanVersion: planVersion,
    });
    expect(result).toMatchObject({ ok: true, value: { outcome: 'applied', hoursPerDay: 6 } });
    expect(fake.calls.some((text) => text.startsWith('update public.study_preferences'))).toBe(
      true,
    );
  });

  it('BR-AUT-11 — « alléger » crée une action en attente sans toucher au planning (CA-2)', async () => {
    mocks.planSchedule.mockReturnValue(
      planResult({
        options: threePlannerOptions(),
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-12-02',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
    );
    const fake = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-06' })] }));
    const planVersion = currentPlanVersion(
      await readPlanningContext(fake.tx, USER, FORMATION, new Date(AT)),
    );
    const result = await applyReplan(context(fake), FORMATION, {
      choice: 'lighten',
      expectedPlanVersion: planVersion,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'consent_required', consentActionId: ACTION },
    });
    expect(fake.calls.some((text) => text.startsWith('update'))).toBe(false);
    expect(mocks.createAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requiresConsent: true, kind: 'plan_lightened' }),
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'automation/action-proposed',
      expect.objectContaining({ actionId: ACTION }),
      expect.anything(),
    );
  });

  it('ET-4 — une version obsolète, un module non bloqué ou une option irréalisable renvoient 409 (CL-2, CL-5)', async () => {
    const stale = await applyReplan(context(fakeTx(handlers())), FORMATION, {
      choice: 'shift_end',
      expectedPlanVersion: 'plan-0000000000000000',
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    mocks.planSchedule.mockReturnValue(
      planResult({
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-11-30',
            missed: false,
            blockedModules: [],
          },
        ],
      }),
    );
    const fake = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-20' })] }));
    const version = currentPlanVersion(
      await readPlanningContext(fake.tx, USER, FORMATION, new Date(AT)),
    );
    const notBlocked = await applyReplan(context(fake), FORMATION, {
      choice: 'shift_end',
      expectedPlanVersion: version,
    });
    expect(notBlocked).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    mocks.planSchedule.mockReturnValue(
      planResult({
        options: [
          learningOption({
            kind: 'increase_volume',
            feasible: false,
            reason: 'Capacité insuffisante.',
            projectedEndDate: null,
            newHoursPerDay: null,
          }),
        ],
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-12-02',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
    );
    const blocked = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-06' })] }));
    const blockedVersion = currentPlanVersion(
      await readPlanningContext(blocked.tx, USER, FORMATION, new Date(AT)),
    );
    const infeasible = await applyReplan(context(blocked), FORMATION, {
      choice: 'increase_volume',
      expectedPlanVersion: blockedVersion,
    });
    expect(infeasible).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('ET-4 — une version obsolète est refusée sans écriture ni événement (CA-3)', async () => {
    mocks.planSchedule.mockReturnValue(
      planResult({
        options: threePlannerOptions(),
        deadlines: [
          {
            formationId: FORMATION,
            endDate: '2026-11-30',
            projectedEndDate: '2026-12-02',
            missed: true,
            blockedModules: [MODULE],
          },
        ],
      }),
    );
    const fake = fakeTx(handlers({ modules: [moduleRow({ planned_end: '2026-11-06' })] }));
    const result = await applyReplan(context(fake), FORMATION, {
      choice: 'shift_end',
      expectedPlanVersion: 'plan-0000000000000000',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(fake.calls.some((text) => text.startsWith('update'))).toBe(false);
    expect(mocks.createAction).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('ET-1 — refuse un utilisateur non authentifié et une formation étrangère', async () => {
    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(getReplanOptions(anonymous, FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    await expect(
      applyReplan(anonymous, FORMATION, {
        choice: 'shift_end',
        expectedPlanVersion: 'plan-1',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    const foreign = await getReplanOptions(
      context(fakeTx(handlers({ formation: null }))),
      FORMATION,
    );
    expect(foreign).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
