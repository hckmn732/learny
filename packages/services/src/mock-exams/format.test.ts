// Unit tests of the mock-exam format and introduction (SPEC-614 EF-1, EF-5, ET-3, CA-1,
// BR-PRA-02, BR-PRA-05). The database, the owner-role planner and the RLS client are fakes: these
// tests pin the normative default, the guide proposal, the explicit confirmation, the allocation
// of the official question count and the read model of the introduction.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';
import { examFormatSchema } from '@learny/db/schema';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import {
  allocateQuestionCounts,
  confirmExamFormat,
  defaultExamFormat,
  getExamIntro,
  isStudiedModule,
  proposeExamFormat,
} from './format';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  ensureMockExamSlots: vi.fn(),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql, schema: { examFormatSchema } }));
vi.mock('../planning', () => ({ ensureMockExamSlots: mocks.ensureMockExamSlots }));

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const GUIDE = '33333333-3333-4333-8333-333333333333';
const MODULE_1 = '44444444-4444-4444-8444-444444444444';
const MODULE_2 = '55555555-5555-4555-8555-555555555555';
const ATTEMPT = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-11T12:20:00Z');

interface State {
  formation: Record<string, unknown> | null;
  guide: Record<string, unknown> | null;
  modules: Record<string, unknown>[];
  nextExams: Record<string, unknown>[];
  lastAttempts: Record<string, unknown>[];
  updates: { text: string; values: unknown[] }[];
}

let state: State;

function resetState(overrides: Partial<State> = {}): void {
  state = {
    formation: {
      id: FORMATION,
      title: 'SAP S/4HANA Finance',
      objectives: ['exam'],
      exam_format: null,
    },
    guide: null,
    modules: [
      {
        module_id: MODULE_1,
        position: 1,
        label: 'Module 1',
        status: 'validated',
        notion_count: 2,
        seen_count: 2,
      },
      {
        module_id: MODULE_2,
        position: 2,
        label: 'Module 2',
        status: 'locked',
        notion_count: 2,
        seen_count: 0,
      },
    ],
    nextExams: [
      { starts_at: new Date('2026-12-04T09:00:00Z'), title: 'Examen blanc 1' },
      { starts_at: '2026-12-11T09:00:00Z', title: 'Examen blanc 2' },
    ],
    lastAttempts: [],
    updates: [],
    ...overrides,
  };
}

function queryOf(value: unknown): { text: string; values: unknown[] } {
  return value as { text: string; values: unknown[] };
}

const execute = vi.fn((value: unknown) => {
  const query = queryOf(value);
  const text = query.text;
  if (text.includes('from public.formations f')) {
    return state.formation === null ? [] : [state.formation];
  }
  if (text.includes('from public.resources')) {
    return state.guide === null ? [] : [state.guide];
  }
  if (text.includes('from public.modules m')) return state.modules;
  if (text.includes('from public.schedule_slots')) return state.nextExams;
  if (text.includes('from public.attempts at')) return state.lastAttempts;
  if (text.includes('update public.formations')) {
    state.updates.push(query);
    return [];
  }
  throw new Error(`Requête non prévue : ${text}`);
});

function context(): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-format',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

beforeEach(() => {
  resetState();
  execute.mockClear();
  mocks.ensureMockExamSlots.mockReset().mockResolvedValue({ ok: true, value: [] });
});

describe('[SPEC-614] format de l’examen blanc', () => {
  it('CA-1 — applique le format normatif sans guide : 20 questions, 2 min, seuil 70 %', () => {
    expect(defaultExamFormat()).toEqual({
      questionCount: 20,
      secondsPerQuestion: 120,
      durationMin: 40,
      threshold: 70,
      source: 'default',
      confirmed: true,
    });
  });

  it('ET-3 — un format enregistré confirmé prime sur le guide et reste idempotent', () => {
    const stored = {
      questions: 12,
      durationMin: 36,
      threshold: 80,
      confirmed: true,
      sourceResourceId: GUIDE,
    };
    expect(
      proposeExamFormat({ stored, guide: { id: GUIDE, metadata: { examFormat: {} } } }),
    ).toEqual({
      questionCount: 12,
      secondsPerQuestion: 180,
      durationMin: 36,
      threshold: 80,
      source: 'guide',
      confirmed: true,
      sourceResourceId: GUIDE,
    });

    const withoutResource = proposeExamFormat({
      stored: { questions: 10, durationMin: 20, threshold: 60, confirmed: false },
      guide: null,
    });
    expect(withoutResource).toMatchObject({ source: 'default', confirmed: false });
    expect(withoutResource).not.toHaveProperty('sourceResourceId');
  });

  it('ET-3 — propose le format extrait du guide, sans l’activer avant confirmation', () => {
    const proposed = proposeExamFormat({
      stored: null,
      guide: {
        id: GUIDE,
        metadata: {
          examFormat: {
            questions: 25,
            durationMin: 50,
            threshold: 75,
          },
        },
      },
    });
    expect(proposed).toEqual({
      questionCount: 25,
      secondsPerQuestion: 120,
      durationMin: 50,
      threshold: 75,
      source: 'guide',
      confirmed: false,
      sourceResourceId: GUIDE,
    });

    const fromCount = proposeExamFormat({
      stored: { questions: 1, durationMin: 1, threshold: 1 },
      guide: {
        id: GUIDE,
        metadata: '{"format":{"questionCount":10,"secondsPerQuestion":90,"threshold":65}}',
      },
    });
    expect(fromCount).toMatchObject({
      questionCount: 10,
      secondsPerQuestion: 90,
      durationMin: 15,
      threshold: 65,
      source: 'guide',
      confirmed: false,
    });

    const fromDefaultCount = proposeExamFormat({
      stored: null,
      guide: { id: GUIDE, metadata: { examFormat: { durationMin: 40, threshold: 70 } } },
    });
    expect(fromDefaultCount).toMatchObject({
      questionCount: 20,
      secondsPerQuestion: 120,
      durationMin: 40,
    });

    const secondsOnly = proposeExamFormat({
      stored: null,
      guide: { id: GUIDE, metadata: { examFormat: { questions: 10, threshold: 60 } } },
    });
    expect(secondsOnly).toMatchObject({
      questionCount: 10,
      durationMin: 20,
      secondsPerQuestion: 120,
    });
  });

  it('ET-3 — ignore un guide illisible ou sans format et retombe sur le défaut', () => {
    expect(proposeExamFormat({ stored: null, guide: { id: GUIDE, metadata: null } })).toMatchObject(
      { source: 'default', confirmed: true },
    );
    expect(
      proposeExamFormat({
        stored: null,
        guide: { id: GUIDE, metadata: { examFormat: { questions: 0, threshold: 200 } } },
      }),
    ).toMatchObject({ source: 'default', confirmed: true });
    expect(
      proposeExamFormat({ stored: null, guide: { id: GUIDE, metadata: '{invalide' } }),
    ).toMatchObject({ source: 'default' });
    expect(proposeExamFormat({ stored: null, guide: { id: GUIDE, metadata: '[]' } })).toMatchObject(
      { source: 'default' },
    );
    expect(proposeExamFormat({ stored: null, guide: { id: GUIDE, metadata: 42 } })).toMatchObject({
      source: 'default',
    });
  });

  it('répartit 20 questions au prorata des notions, puis par plus forte fraction', () => {
    const counts = allocateQuestionCounts(20, [
      { moduleId: 'm1', notionCount: 2 },
      { moduleId: 'm2', notionCount: 4 },
      { moduleId: 'm3', notionCount: 6 },
      { moduleId: 'm4', notionCount: 2 },
      { moduleId: 'm5', notionCount: 2 },
      { moduleId: 'm6', notionCount: 2 },
      { moduleId: 'm7', notionCount: 2 },
    ]);
    expect([...counts.values()]).toEqual([2, 4, 6, 2, 2, 2, 2]);
    expect([...counts.values()].reduce((sum, value) => sum + value, 0)).toBe(20);
  });

  it('gère les modules sans notion, les listes vides et les notions négatives', () => {
    expect(allocateQuestionCounts(0, [{ moduleId: 'm1', notionCount: 2 }])).toEqual(new Map());
    expect(allocateQuestionCounts(5, [])).toEqual(new Map());
    const even = allocateQuestionCounts(5, [
      { moduleId: 'm1', notionCount: 0 },
      { moduleId: 'm2', notionCount: 0 },
    ]);
    expect([...even.values()]).toEqual([3, 2]);
    const negative = allocateQuestionCounts(3, [
      { moduleId: 'm1', notionCount: -2 },
      { moduleId: 'm2', notionCount: 3 },
    ]);
    expect([...negative.values()].reduce((sum, value) => sum + value, 0)).toBe(3);
    expect(negative.get('m2')).toBe(3);
  });

  it('répartit le reste par plus forte fraction puis par ordre d’identifiant', () => {
    const counts = allocateQuestionCounts(5, [
      { moduleId: 'm1', notionCount: 1 },
      { moduleId: 'm2', notionCount: 1 },
      { moduleId: 'm3', notionCount: 1 },
    ]);
    expect([...counts.values()]).toEqual([2, 2, 1]);
    const tie = allocateQuestionCounts(3, [
      { moduleId: 'm2', notionCount: 1 },
      { moduleId: 'm1', notionCount: 1 },
    ]);
    expect(tie.get('m1')).toBe(2);
    expect(tie.get('m2')).toBe(1);
  });

  it('ET-5 — un module est étudié dès qu’il n’est plus verrouillé ou qu’une notion a été vue', () => {
    expect(isStudiedModule({ status: 'open', seenCount: 0 })).toBe(true);
    expect(isStudiedModule({ status: 'validated', seenCount: 0 })).toBe(true);
    expect(isStudiedModule({ status: 'locked', seenCount: 1 })).toBe(true);
    expect(isStudiedModule({ status: 'locked', seenCount: 0 })).toBe(false);
  });
});

describe('[SPEC-614] introduction de l’examen blanc', () => {
  it('refuse un appelant anonyme et un identifiant invalide', async () => {
    await expect(
      getExamIntro({ ...context(), userId: null, db: null }, FORMATION),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    await expect(getExamIntro(context(), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('BR-PRA-05 — propage l’échec de la planification des deux examens', async () => {
    mocks.ensureMockExamSlots.mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: 'planning' },
    });
    await expect(getExamIntro(context(), FORMATION)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('CA-1 — lit le format par défaut, les modules étudiés/diagnostiques et les échéances', async () => {
    state.lastAttempts = [{ id: ATTEMPT, status: 'graded', score: '62.50' }];
    const result = await getExamIntro(context(), FORMATION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      formationId: FORMATION,
      title: 'SAP S/4HANA Finance',
      hasGuide: false,
      format: {
        questionCount: 20,
        durationMin: 40,
        threshold: 70,
        source: 'default',
        confirmed: true,
      },
      studiedModules: [{ moduleId: MODULE_1, position: 1, label: 'Module 1' }],
      diagnosticModules: [{ moduleId: MODULE_2, position: 2, label: 'Module 2' }],
      diagnosticQuestionCount: 10,
      lastAttempt: { attemptId: ATTEMPT, status: 'graded', score: 62.5 },
    });
    expect(result.value.nextExams).toEqual([
      { startsAt: '2026-12-04T09:00:00.000Z', label: 'Examen blanc 1' },
      { startsAt: '2026-12-11T09:00:00.000Z', label: 'Examen blanc 2' },
    ]);
  });

  it('ET-3 — expose le format proposé depuis un guide non confirmé', async () => {
    state.guide = {
      id: GUIDE,
      metadata: { examFormat: { questions: 16, durationMin: 32, threshold: 65 } },
      content_text: 'Guide',
    };
    const result = await getExamIntro(context(), FORMATION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasGuide).toBe(true);
    expect(result.value.format).toMatchObject({
      questionCount: 16,
      secondsPerQuestion: 120,
      durationMin: 32,
      threshold: 65,
      source: 'guide',
      confirmed: false,
      sourceResourceId: GUIDE,
    });
    expect(result.value.lastAttempt).toBeNull();
  });

  it('refuse une formation absente même si la planification a réussi', async () => {
    state.formation = null;
    await expect(getExamIntro(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('refuse une tentative au statut inconnu dans le résumé', async () => {
    state.lastAttempts = [{ id: ATTEMPT, status: 'inconnu', score: null }];
    await expect(getExamIntro(context(), FORMATION)).rejects.toThrow();
  });
});

describe('[SPEC-614] confirmation du format', () => {
  it('refuse un identifiant invalide et une formation introuvable', async () => {
    await expect(confirmExamFormat(context(), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(
      confirmExamFormat({ ...context(), userId: null, db: null }, FORMATION),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    state.formation = null;
    await expect(confirmExamFormat(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('ET-3 — confirme et enregistre le format du guide avec son origine', async () => {
    state.guide = {
      id: GUIDE,
      metadata: { examFormat: { questions: 18, durationMin: 36, threshold: 72 } },
      content_text: 'Guide',
    };
    const result = await confirmExamFormat(context(), FORMATION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      questionCount: 18,
      secondsPerQuestion: 120,
      durationMin: 36,
      threshold: 72,
      source: 'guide',
      confirmed: true,
      sourceResourceId: GUIDE,
    });
    expect(state.updates).toHaveLength(1);
    const stored: unknown = JSON.parse(String(state.updates[0]?.values[0]));
    expect(stored).toEqual({
      questions: 18,
      durationMin: 36,
      threshold: 72,
      confirmed: true,
      sourceResourceId: GUIDE,
    });
    expect(examFormatSchema.safeParse(stored).success).toBe(true);
  });

  it('ET-3 — confirme le format par défaut sans ressource d’origine', async () => {
    const result = await confirmExamFormat(context(), FORMATION);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      questionCount: 20,
      durationMin: 40,
      threshold: 70,
      source: 'default',
      confirmed: true,
    });
    const stored: unknown = JSON.parse(String(state.updates[0]?.values[0]));
    expect(stored).not.toHaveProperty('sourceResourceId');
  });
});
