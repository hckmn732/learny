// Unit tests of the persistent mock-exam attempt (SPEC-614 EF-2 to EF-4, ET-1, ET-4, ET-5, CA-2
// to CA-4, BR-PRA-02 to BR-PRA-04, ADR-0172). The RLS database, the transaction and the learning
// projection are fakes: these tests pin the frozen deadline, the refusal of a late answer, the
// single grading of the submission, the lazy submission of an expired attempt and the result read
// model. The code graders of SPEC-502 are the real ones.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrickType } from '@learny/bricks';
import { toPublicBrick } from '@learny/bricks';
import type { UserDatabase } from '@learny/db';
import { examFormatSchema } from '@learny/db/schema';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import {
  getExamAttempt,
  getExamResult,
  markExamQuestion,
  saveExamAnswer,
  startExamAttempt,
  submitExam,
} from './attempt';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
  outboxAdd: vi.fn(),
  applyLearningResult: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql, schema: { examFormatSchema } }));
vi.mock('../planning', () => ({ ensureMockExamSlots: vi.fn() }));
vi.mock('@learny/jobs', () => ({
  withTransaction: async (
    database: {
      run: (flow: (tx: unknown, outbox: unknown) => Promise<unknown>) => Promise<unknown>;
    },
    flow: (tx: unknown, outbox: { add: typeof mocks.outboxAdd }) => Promise<unknown>,
  ) => database.run((tx: unknown) => flow(tx, { add: mocks.outboxAdd })),
}));
vi.mock('../learning/apply-result', () => ({
  applyLearningResult: mocks.applyLearningResult,
}));

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '11111111-1111-4111-8111-111111111112';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const GUIDE = '33333333-3333-4333-8333-333333333333';
const MODULE_1 = '44444444-4444-4444-8444-444444444444';
const MODULE_2 = '55555555-5555-4555-8555-555555555555';
const MODULE_3 = '66666666-6666-4666-8666-666666666666';
const NOTION_1 = '77777777-7777-4777-8777-777777777777';
const NOTION_2 = '88888888-8888-4888-8888-888888888888';
const NOTION_3 = '99999999-9999-4999-8999-999999999999';
const BRICK_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BRICK_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BRICK_3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BRICK_4 = 'abababab-abab-4bab-8bab-abababababab';
const VERSION_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const VERSION_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const VERSION_3 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const VERSION_4 = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
const ACTIVITY = '10101010-1010-4010-8010-101010101010';
const ATTEMPT = '20202020-2020-4020-8020-202020202020';
const EXISTING = '30303030-3030-4030-8030-303030303030';
const NOW = new Date('2026-11-11T12:20:00Z');

interface FakeActivity {
  id: string;
  formation_id: string;
  config: unknown;
  items: unknown;
}

interface FakeAttempt {
  id: string;
  user_id: string;
  activity_id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  deadline_at: Date | string;
  submitted_at: Date | string | null;
  duration_ms: number | null;
  score: string | null;
  passed: boolean | null;
  review_feedback: unknown;
}

interface FakeAnswer {
  id: string;
  attempt_id: string;
  position: number;
  brick_version_id: string;
  response: unknown;
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  graded_by: string | null;
  feedback: unknown;
  time_ms: number | null;
  answered_at?: string | null;
}

interface State {
  formation: Record<string, unknown> | null;
  guide: Record<string, unknown> | null;
  modules: Record<string, unknown>[];
  bank: Record<string, unknown>[];
  activities: FakeActivity[];
  attempts: FakeAttempt[];
  answers: FakeAnswer[];
  inProgressCalls: number;
  replayAfterLock: boolean;
  failActivityInsert: boolean;
  failAttemptInsert: boolean;
}

let state: State;

function choicePayload(label: string, correct = 'a'): Record<string, unknown> {
  return {
    stem: `Quelle affirmation décrit ${label} ?`,
    mode: 'single',
    options: [
      { id: 'a', text: 'La règle exacte', correct: correct === 'a', notionId: null },
      { id: 'b', text: 'Une confusion', correct: correct === 'b', notionId: null },
    ],
    explanation: 'La règle exacte décrit la notion.',
    objective: 'Vérifier la notion',
    sources: [],
  };
}

const CLOZE_PAYLOAD = {
  template: 'Les {{1}} diminués des {{2}} donnent le résultat.',
  gaps: [
    { id: 1, answers: ['produits'], hint: 'Ce que l’entreprise gagne' },
    { id: 2, answers: ['charges'], hint: 'Ce que l’entreprise dépense' },
  ],
  explanation: 'Les produits moins les charges forment le résultat.',
  sources: [],
};

const MATCHING_PAYLOAD = {
  instruction: 'Associez chaque document à son cycle.',
  pairs: [
    { id: 'a', left: 'Facture', right: 'Ventes', notionId: NOTION_1 },
    { id: 'b', left: 'Relevé', right: 'Trésorerie', notionId: NOTION_2 },
  ],
  extraRights: [],
  explanation: 'Chaque pièce se rattache à un cycle précis.',
  sources: [],
};

const OPEN_PAYLOAD = {
  stem: 'Expliquez la partie double.',
  expectedElements: ['Débit = crédit'],
  criteria: [{ key: 'principe', label: 'Principe', points: 10, description: '' }],
  answerMaxChars: 500,
  modelAnswer: 'Chaque flux est enregistré deux fois.',
  explanation: 'La partie double équilibre chaque écriture.',
  objective: 'Justifier la partie double',
  sources: [],
};

function bankRow(
  module: string,
  modulePosition: number,
  moduleLabel: string,
  notion: string,
  notionLabel: string,
  brick: string,
  version: string,
  type: BrickType,
  payload: unknown,
  purpose = 'bank',
): Record<string, unknown> {
  return {
    brick_id: brick,
    version_id: version,
    type,
    notion_ids: [notion],
    purpose,
    payload,
    notion_id: notion,
    notion_label: notionLabel,
    module_id: module,
    module_position: modulePosition,
    module_label: moduleLabel,
  };
}

function resetState(overrides: Partial<State> = {}): void {
  state = {
    formation: {
      id: FORMATION,
      title: 'SAP S/4HANA Finance',
      exam_format: null,
    },
    guide: null,
    modules: [
      {
        module_id: MODULE_1,
        position: 1,
        label: 'Module 1',
        status: 'open',
        notion_count: 2,
        seen_count: 0,
      },
      {
        module_id: MODULE_2,
        position: 2,
        label: 'Module 2',
        status: 'locked',
        notion_count: 1,
        seen_count: 0,
      },
      {
        module_id: MODULE_3,
        position: 3,
        label: 'Module 3',
        status: 'validated',
        notion_count: 1,
        seen_count: 1,
      },
    ],
    bank: [
      bankRow(
        MODULE_1,
        1,
        'Module 1',
        NOTION_1,
        'Notion 1',
        BRICK_1,
        VERSION_1,
        'choice_question',
        choicePayload('la notion 1'),
      ),
      bankRow(
        MODULE_1,
        1,
        'Module 1',
        NOTION_2,
        'Notion 2',
        BRICK_2,
        VERSION_2,
        'choice_question',
        choicePayload('la notion 2'),
      ),
      bankRow(
        MODULE_2,
        2,
        'Module 2',
        NOTION_3,
        'Notion 3',
        BRICK_3,
        VERSION_3,
        'choice_question',
        choicePayload('la notion 3', 'b'),
      ),
      bankRow(
        MODULE_3,
        3,
        'Module 3',
        NOTION_3,
        'Notion 3',
        BRICK_4,
        VERSION_4,
        'choice_question',
        choicePayload('la notion 3', 'b'),
      ),
      bankRow(
        MODULE_3,
        3,
        'Module 3',
        NOTION_3,
        'Notion 3',
        '12121212-1212-4212-8212-121212121212',
        '13131313-1313-4313-8313-131313131313',
        'text',
        { text: 'Lecture', sources: [] },
      ),
    ],
    activities: [],
    attempts: [],
    answers: [],
    inProgressCalls: 0,
    replayAfterLock: false,
    failActivityInsert: false,
    failAttemptInsert: false,
    ...overrides,
  };
}

function queryOf(value: unknown): { text: string; values: unknown[] } {
  return value as { text: string; values: unknown[] };
}

function attemptOf(id: string): FakeAttempt | undefined {
  return state.attempts.find((attempt) => attempt.id === id);
}

function activityOf(id: string): FakeActivity | undefined {
  return state.activities.find((activity) => activity.id === id);
}

function attemptRow(attempt: FakeAttempt): Record<string, unknown> {
  const activity = activityOf(attempt.activity_id);
  return {
    ...attempt,
    formation_id: activity?.formation_id ?? '',
    config: activity?.config ?? {},
    items: activity?.items ?? [],
  };
}

const execute = vi.fn((value: unknown) => {
  const query = queryOf(value);
  const text = query.text;
  const values = query.values;
  if (text.includes('pg_advisory_xact_lock')) return [];
  if (text.includes('insert into public.activities')) {
    if (state.failActivityInsert) return [];
    const activity: FakeActivity = {
      id: ACTIVITY,
      formation_id: String(values[1]),
      config: JSON.parse(String(values[2])),
      items: JSON.parse(String(values[3])),
    };
    state.activities.push(activity);
    return [{ id: ACTIVITY }];
  }
  if (text.includes('insert into public.attempts')) {
    if (state.failAttemptInsert) return [];
    state.attempts.push({
      id: ATTEMPT,
      user_id: String(values[0]),
      activity_id: String(values[1]),
      attempt_no: Number(values[2]),
      status: 'in_progress',
      started_at: String(values[3]),
      deadline_at: String(values[4]),
      submitted_at: null,
      duration_ms: null,
      score: null,
      passed: null,
      review_feedback: null,
    });
    return [{ id: ATTEMPT }];
  }
  if (text.includes('insert into public.answers')) {
    const attemptId = String(values[0]);
    const position = Number(values[2]);
    state.answers.push({
      id: `answer-${attemptId}-${String(position)}`,
      attempt_id: attemptId,
      position,
      brick_version_id: String(values[1]),
      response: null,
      is_correct: null,
      score: null,
      max_score: String(values[3]),
      graded_by: null,
      feedback: null,
      time_ms: null,
      answered_at: String(values[4]),
    });
    return [];
  }
  if (text.includes('update public.answers') && text.includes('set response')) {
    const answer = state.answers.find(
      (entry) => entry.attempt_id === String(values[3]) && entry.position === Number(values[4]),
    );
    if (answer !== undefined) {
      answer.response = JSON.parse(String(values[0]));
      answer.time_ms = Number(values[1]);
      answer.answered_at = String(values[2]);
    }
    return [];
  }
  if (text.includes('update public.answers') && text.includes('set is_correct')) {
    const answer = state.answers.find((entry) => entry.id === String(values[5]));
    if (answer !== undefined) {
      answer.is_correct = Boolean(values[0]);
      answer.score = String(values[1]);
      answer.max_score = String(values[2]);
      answer.graded_by = 'code';
      answer.feedback = JSON.parse(String(values[3]));
      answer.answered_at = answer.answered_at ?? String(values[4]);
    }
    return [];
  }
  if (text.includes('update public.attempts') && text.includes('set review_feedback')) {
    const attempt = attemptOf(String(values[1]));
    if (attempt !== undefined) {
      const markedPositions = JSON.parse(String(values[0])) as unknown;
      attempt.review_feedback = {
        ...(attempt.review_feedback as Record<string, unknown> | null),
        markedPositions,
      };
    }
    return [];
  }
  if (text.includes('update public.attempts') && text.includes("set status = 'graded'")) {
    const attempt = attemptOf(String(values[6]));
    if (attempt !== undefined) {
      attempt.status = 'graded';
      attempt.score = String(values[0]);
      attempt.passed = Boolean(values[1]);
      attempt.submitted_at = String(values[3]);
      attempt.duration_ms = Number(values[4]);
      attempt.review_feedback = JSON.parse(String(values[5]));
    }
    return [];
  }
  if (text.includes('from public.formations f')) {
    return state.formation === null ? [] : [state.formation];
  }
  if (text.includes('from public.resources')) {
    return state.guide === null ? [] : [state.guide];
  }
  if (text.includes('from public.modules m')) return state.modules;
  if (text.includes('from public.bricks b')) return state.bank;
  if (text.includes('from public.answers')) {
    return state.answers
      .filter((answer) => answer.attempt_id === String(values[0]))
      .sort((left, right) => left.position - right.position);
  }
  if (text.includes('at.activity_id::text as activity_id')) {
    const attempt = attemptOf(String(values[0]));
    if (
      attempt === undefined ||
      attempt.user_id !== String(values[1]) ||
      !text.includes("act.kind = 'mock_exam'")
    ) {
      return [];
    }
    return [attemptRow(attempt)];
  }
  if (text.includes('select count(*)::int as count') && text.includes('from public.attempts at')) {
    const count = state.attempts.filter((attempt) => {
      const activity = activityOf(attempt.activity_id);
      return attempt.user_id === String(values[0]) && activity?.formation_id === String(values[1]);
    }).length;
    return [{ count }];
  }
  if (text.includes('from public.attempts at') && text.includes("at.status = 'in_progress'")) {
    state.inProgressCalls += 1;
    if (state.replayAfterLock && state.inProgressCalls > 1) {
      return [{ id: EXISTING }];
    }
    const attempt = state.attempts.find((entry) => {
      const activity = activityOf(entry.activity_id);
      return (
        entry.user_id === String(values[0]) &&
        activity?.formation_id === String(values[1]) &&
        entry.status === 'in_progress'
      );
    });
    return attempt === undefined ? [] : [{ id: attempt.id }];
  }
  throw new Error(`Requête non prévue : ${text}`);
});

function context(overrides: Partial<ServiceContext> = {}): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-attempt',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: { warn: mocks.warn } as never,
    ...overrides,
  };
}

function questionItem(
  position: number,
  moduleId: string,
  modulePosition: number,
  moduleLabel: string,
  notionId: string,
  notionLabel: string,
  versionId: string,
  type: BrickType,
  payload: unknown,
  studied: boolean,
): Record<string, unknown> {
  return {
    brickId: `brick-${String(position)}`,
    brickVersionId: versionId,
    points: 100 / 3,
    notionId,
    notionLabel,
    type,
    payload,
    moduleId,
    modulePosition,
    moduleLabel,
    studied,
  };
}

const DEFAULT_ITEMS = [
  questionItem(
    1,
    MODULE_1,
    1,
    'Module 1',
    NOTION_1,
    'Notion 1',
    VERSION_1,
    'choice_question',
    choicePayload('la notion 1'),
    true,
  ),
  questionItem(
    2,
    MODULE_1,
    1,
    'Module 1',
    NOTION_2,
    'Notion 2',
    VERSION_2,
    'choice_question',
    choicePayload('la notion 2'),
    true,
  ),
  questionItem(
    3,
    MODULE_2,
    2,
    'Module 2',
    NOTION_3,
    'Notion 3',
    VERSION_3,
    'choice_question',
    choicePayload('la notion 3', 'b'),
    false,
  ),
];

const DEFAULT_CONFIG = {
  threshold: 70,
  durationSec: 2_400,
  questionCount: 3,
  scoring: 'equal',
  examFormat: {
    questionCount: 3,
    secondsPerQuestion: 800,
    durationMin: 40,
    threshold: 70,
    source: 'default',
    confirmed: true,
  },
  diagnosticPositions: [3],
  modules: [
    { moduleId: MODULE_1, position: 1, label: 'Module 1', studied: true },
    { moduleId: MODULE_2, position: 2, label: 'Module 2', studied: false },
  ],
};

interface SeedOptions {
  status?: string;
  startedAt?: Date | string;
  deadlineAt?: Date | string;
  reviewFeedback?: unknown;
  config?: unknown;
  items?: unknown[];
  answers?: { position: number; response: unknown; maxScore?: number; timeMs?: number }[];
  userId?: string;
  attemptId?: string;
  formationId?: string;
}

function seedAttempt(options: SeedOptions = {}): FakeAttempt {
  const items = options.items ?? DEFAULT_ITEMS;
  const activity: FakeActivity = {
    id: ACTIVITY,
    formation_id: options.formationId ?? FORMATION,
    config: options.config ?? DEFAULT_CONFIG,
    items,
  };
  state.activities = [activity];
  const attempt: FakeAttempt = {
    id: options.attemptId ?? ATTEMPT,
    user_id: options.userId ?? USER,
    activity_id: ACTIVITY,
    attempt_no: 1,
    status: options.status ?? 'in_progress',
    started_at: options.startedAt ?? NOW,
    deadline_at: options.deadlineAt ?? new Date(NOW.getTime() + 2_400_000),
    submitted_at: options.status === 'graded' ? NOW : null,
    duration_ms: options.status === 'graded' ? 600_000 : null,
    score: options.status === 'graded' ? '0' : null,
    passed: options.status === 'graded' ? false : null,
    review_feedback: options.reviewFeedback ?? null,
  };
  state.attempts = [attempt];
  const answers = options.answers ?? [
    { position: 1, response: { optionIds: ['a'] } },
    { position: 2, response: {} },
    { position: 3, response: {} },
  ];
  state.answers = answers.map((answer) => {
    const item = items.find((entry, index) => index + 1 === answer.position) as
      Record<string, unknown> | undefined;
    return {
      id: `answer-${String(answer.position)}`,
      attempt_id: attempt.id,
      position: answer.position,
      brick_version_id: typeof item?.brickVersionId === 'string' ? item.brickVersionId : VERSION_1,
      response: answer.response,
      is_correct: null,
      score: null,
      max_score: String(answer.maxScore ?? (typeof item?.points === 'number' ? item.points : 0)),
      graded_by: null,
      feedback: null,
      time_ms: answer.timeMs ?? null,
      answered_at: NOW.toISOString(),
    };
  });
  return attempt;
}

beforeEach(() => {
  resetState();
  execute.mockClear();
  mocks.outboxAdd.mockReset();
  mocks.applyLearningResult.mockReset().mockResolvedValue({ ok: true, value: {} });
  mocks.warn.mockReset();
});

describe('[SPEC-614] démarrage de l’examen blanc', () => {
  it('refuse un appelant anonyme, un identifiant invalide et une formation absente', async () => {
    await expect(
      startExamAttempt({ ...context(), userId: null, db: null }, FORMATION),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    await expect(startExamAttempt(context(), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    state.formation = null;
    await expect(startExamAttempt(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('ET-3 — refuse un guide non confirmé avant toute création de tentative', async () => {
    state.guide = {
      id: GUIDE,
      metadata: { examFormat: { questions: 20, durationMin: 40, threshold: 70 } },
    };
    await expect(startExamAttempt(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'FORMAT_NOT_CONFIRMED' },
    });
    expect(state.attempts).toHaveLength(0);
  });

  it('refuse une formation sans programme ou sans question d’examen', async () => {
    state.modules = [];
    await expect(startExamAttempt(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    resetState({ bank: [] });
    await expect(startExamAttempt(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  it('CA-1, CA-2 — gèle les questions, le barème et l’échéance, puis reprend la tentative', async () => {
    const started = await startExamAttempt(context(), FORMATION);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value).toEqual({ attemptId: ATTEMPT });
    expect(state.activities).toHaveLength(1);
    const activity = state.activities[0];
    expect(activity?.config).toMatchObject({
      threshold: 70,
      durationSec: 2_400,
      questionCount: 4,
      scoring: 'equal',
    });
    expect((activity?.config as { diagnosticPositions: number[] }).diagnosticPositions).toEqual([
      3,
    ]);
    expect((activity?.config as { modules: unknown[] }).modules).toHaveLength(3);
    expect(state.attempts[0]).toMatchObject({ status: 'in_progress', attempt_no: 1 });
    expect(state.answers).toHaveLength(4);
    expect(new Date(String(state.attempts[0]?.deadline_at)).toISOString()).toBe(
      '2026-11-11T13:00:00.000Z',
    );
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'exam/started',
      expect.objectContaining({ userId: USER, formationId: FORMATION, attemptId: ATTEMPT }),
      { id: `exam-started:${ATTEMPT}` },
    );

    const resumed = await startExamAttempt(context(), FORMATION);
    expect(resumed).toEqual({ ok: true, value: { attemptId: ATTEMPT, resumed: true } });
    expect(state.activities).toHaveLength(1);
  });

  it('CA-2 — une tentative créée sous le verrou est reprise sans doublon', async () => {
    state.replayAfterLock = true;
    const started = await startExamAttempt(context(), FORMATION);
    expect(started).toEqual({ ok: true, value: { attemptId: EXISTING, resumed: true } });
    expect(state.activities).toHaveLength(0);
    expect(state.attempts).toHaveLength(0);
  });

  it('refuse une création incomplète d’activité ou de tentative', async () => {
    state.failActivityInsert = true;
    await expect(startExamAttempt(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
    resetState({ failAttemptInsert: true });
    await expect(startExamAttempt(context(), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('ne retient que les questions jouables et privilégie les briques d’examen', async () => {
    state.bank = [
      bankRow(
        MODULE_1,
        1,
        'Module 1',
        NOTION_1,
        'Notion 1',
        BRICK_1,
        VERSION_1,
        'choice_question',
        choicePayload('la notion 1'),
        'exam',
      ),
      bankRow(
        MODULE_1,
        1,
        'Module 1',
        NOTION_2,
        'Notion 2',
        BRICK_2,
        VERSION_2,
        'choice_question',
        choicePayload('la notion 2'),
        'bank',
      ),
    ];
    const started = await startExamAttempt(context(), FORMATION);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const items = state.activities[0]?.items as { brickId: string }[];
    expect(items.map((item) => item.brickId)).toEqual([BRICK_1]);
  });
});

describe('[SPEC-614] lecture de la tentative', () => {
  it('refuse un identifiant invalide et une tentative d’un autre apprenant', async () => {
    await expect(getExamAttempt(context(), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    seedAttempt({ userId: OTHER });
    await expect(getExamAttempt(context(), ATTEMPT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('ET-4, BR-PRA-03 — rend le compteur serveur, les réponses et les marqueurs', async () => {
    seedAttempt({
      reviewFeedback: { markedPositions: [1, 3] },
      answers: [
        { position: 1, response: { optionIds: ['a'] }, timeMs: 1_500 },
        { position: 2, response: {} },
        { position: 3, response: { optionIds: ['b'] } },
      ],
    });
    const result = await getExamAttempt(context(), ATTEMPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: ATTEMPT,
      attemptNo: 1,
      formationId: FORMATION,
      status: 'in_progress',
      threshold: 70,
      total: 3,
      answeredCount: 2,
      markedCount: 2,
      remainingSeconds: 2_400,
      serverTime: NOW.toISOString(),
    });
    expect(result.value.questions[0]).toMatchObject({
      position: 1,
      marked: true,
      response: { optionIds: ['a'] },
      maxScore: 100 / 3,
    });
    expect(result.value.questions[1]).toMatchObject({ position: 2, marked: false });
    expect(result.value.questions[1]).not.toHaveProperty('response');
    expect(result.value.questions[2]).toMatchObject({ marked: true });
    expect(result.value.questions.every((question) => question.feedback === undefined)).toBe(true);
    expect(
      JSON.stringify(result.value.questions.map((question) => question.payload)),
    ).not.toContain('"correct"');
  });

  it('CA-2 — une lecture après l’échéance soumet automatiquement la tentative', async () => {
    seedAttempt({ deadlineAt: '2026-11-11T12:10:00Z' });
    const result = await getExamAttempt(context(), ATTEMPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('graded');
    expect(result.value.remainingSeconds).toBe(0);
    expect(result.value.questions[0]?.feedback).toBeDefined();
    expect(mocks.applyLearningResult).toHaveBeenCalledTimes(1);
  });

  it('ignore une tentative déjà corrigée lors d’une relecture expirée', async () => {
    seedAttempt({ status: 'graded', deadlineAt: '2026-11-11T12:10:00Z' });
    const result = await getExamAttempt(context(), ATTEMPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('graded');
    expect(mocks.applyLearningResult).not.toHaveBeenCalled();
  });

  it('tolère les JSON stockés en texte et un payload de question illisible', async () => {
    seedAttempt({
      config: JSON.stringify(DEFAULT_CONFIG),
      reviewFeedback: '[]',
      items: [
        questionItem(
          1,
          MODULE_1,
          1,
          'Module 1',
          NOTION_1,
          'Notion 1',
          VERSION_1,
          'choice_question',
          { stem: 'invalide' },
          true,
        ),
      ],
      answers: [{ position: 1, response: { optionIds: ['a'] } }],
    });
    const first = await getExamAttempt(context(), ATTEMPT);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value).toMatchObject({ threshold: 70, total: 1, markedCount: 0 });
    expect(first.value.questions[0]?.payload).toBeNull();

    const attempt = state.attempts[0];
    if (attempt !== undefined) attempt.review_feedback = '{invalide';
    const second = await getExamAttempt(context(), ATTEMPT);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.markedCount).toBe(0);
  });
});

describe('[SPEC-614] réponse à une question', () => {
  it('refuse un identifiant invalide et une tentative terminée', async () => {
    await expect(
      saveExamAnswer(context(), 'pas-un-uuid', 1, { response: {}, timeMs: 0 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    seedAttempt({ status: 'graded' });
    await expect(
      saveExamAnswer(context(), ATTEMPT, 1, { response: { optionIds: ['a'] }, timeMs: 0 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('ET-4 — refuse une réponse après l’échéance et une position hors examen', async () => {
    seedAttempt({ deadlineAt: '2026-11-11T12:10:00Z' });
    await expect(
      saveExamAnswer(context(), ATTEMPT, 1, { response: { optionIds: ['a'] }, timeMs: 0 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'EXAM_TIME_OVER' } });

    resetState();
    seedAttempt();
    await expect(
      saveExamAnswer(context(), ATTEMPT, 9, { response: { optionIds: ['a'] }, timeMs: 0 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('ET-1 — refuse une réponse qui ne correspond pas au schéma de la question', async () => {
    seedAttempt();
    await expect(
      saveExamAnswer(context(), ATTEMPT, 1, { response: { optionIds: ['inconnue'] }, timeMs: 10 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('ET-1 — refuse une question jouée dont le payload est illisible', async () => {
    seedAttempt({
      items: [
        questionItem(
          1,
          MODULE_1,
          1,
          'Module 1',
          NOTION_1,
          'Notion 1',
          VERSION_1,
          'cloze',
          { template: 'illisible' },
          true,
        ),
      ],
      answers: [{ position: 1, response: { gaps: { '1': 'x' } } }],
    });
    await expect(
      saveExamAnswer(context(), ATTEMPT, 1, { response: { gaps: { '1': 'x' } }, timeMs: 10 }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('EF-2 — enregistre la réponse et borne le temps passé', async () => {
    seedAttempt();
    const saved = await saveExamAnswer(context(), ATTEMPT, 1, {
      response: { optionIds: ['b'] },
      timeMs: -20,
    });
    expect(saved).toEqual({
      ok: true,
      value: { position: 1, savedAt: NOW.toISOString() },
    });
    expect(state.answers.find((answer) => answer.position === 1)).toMatchObject({
      response: { optionIds: ['b'] },
      time_ms: 0,
      answered_at: NOW.toISOString(),
    });

    await saveExamAnswer(context(), ATTEMPT, 1, {
      response: { optionIds: ['a'] },
      timeMs: 3_000_000,
    });
    expect(state.answers.find((answer) => answer.position === 1)?.time_ms).toBe(1_800_000);
  });

  it('BR-PRA-03 — marque puis démarque une question, sans perdre l’ordre', async () => {
    seedAttempt({ reviewFeedback: { markedPositions: [3] } });
    await expect(markExamQuestion(context(), ATTEMPT, 1, true)).resolves.toEqual({
      ok: true,
      value: { position: 1, marked: true },
    });
    expect(state.attempts[0]?.review_feedback).toMatchObject({ markedPositions: [1, 3] });
    await expect(markExamQuestion(context(), ATTEMPT, 3, false)).resolves.toEqual({
      ok: true,
      value: { position: 3, marked: false },
    });
    expect(state.attempts[0]?.review_feedback).toMatchObject({ markedPositions: [1] });
  });

  it('refuse un marqueur invalide, hors examen ou sur une tentative terminée', async () => {
    await expect(markExamQuestion(context(), 'pas-un-uuid', 1, true)).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    seedAttempt();
    await expect(markExamQuestion(context(), ATTEMPT, 9, true)).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    resetState();
    seedAttempt({ status: 'graded' });
    await expect(markExamQuestion(context(), ATTEMPT, 1, true)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });
});

describe('[SPEC-614] soumission et résultat', () => {
  it('refuse un identifiant invalide et une tentative absente', async () => {
    await expect(submitExam(context(), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(submitExam(context(), ATTEMPT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    await expect(
      submitExam({ ...context(), userId: null, db: null }, ATTEMPT),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });

  it('EF-3, EF-4 — corrige une seule fois, sépare étudié et diagnostic et publie une fois', async () => {
    seedAttempt({
      startedAt: new Date(NOW.getTime() - 600_000),
      reviewFeedback: { markedPositions: [2] },
      answers: [
        { position: 1, response: { optionIds: ['a'] } },
        { position: 2, response: { optionIds: ['b'] } },
        { position: 3, response: { optionIds: ['b'] } },
      ],
    });
    const submitted = await submitExam(context(), ATTEMPT, { trigger: 'manual' });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.value).toMatchObject({
      status: 'graded',
      unansweredCount: 0,
      markedCount: 1,
      timedOut: false,
    });
    expect(submitted.value.outcome).toMatchObject({
      score: 67,
      passed: false,
      studied: { correct: 1, total: 2, score: 50 },
      diagnostic: { correct: 1, total: 1, score: 100 },
    });
    expect(state.attempts[0]).toMatchObject({ status: 'graded', passed: false });
    expect(state.answers.every((answer) => answer.graded_by === 'code')).toBe(true);
    expect(mocks.applyLearningResult).toHaveBeenCalledTimes(1);
    expect(mocks.outboxAdd).toHaveBeenCalledWith(
      'exam/submitted',
      { userId: USER, formationId: FORMATION, attemptId: ATTEMPT },
      { id: `exam-submitted:${ATTEMPT}` },
    );

    const result = await getExamResult(context(), ATTEMPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      attemptId: ATTEMPT,
      formationId: FORMATION,
      status: 'graded',
      threshold: 70,
      durationMin: 40,
      timeUsedMin: 10,
      timedOut: false,
      score: 67,
      passed: false,
      answeredCount: 3,
      total: 3,
      studied: { score: 50, correct: 1, total: 2 },
      diagnostic: { score: 100, correct: 1, total: 1 },
    });
    expect(result.value.gaps).toEqual([
      {
        notionId: NOTION_2,
        notionLabel: 'Notion 2',
        moduleId: MODULE_1,
        modulePosition: 1,
        moduleLabel: 'Module 1',
      },
    ]);
    expect(result.value.review).toHaveLength(3);
    expect(result.value.review[1]).toMatchObject({ isCorrect: false, expected: 'La règle exacte' });

    const again = await submitExam(context(), ATTEMPT, { trigger: 'manual' });
    expect(again).toMatchObject({
      ok: true,
      value: { status: 'graded', outcome: null },
    });
    expect(mocks.applyLearningResult).toHaveBeenCalledTimes(1);
  });

  it('EF-3 — un déclenchement échéance ou paresseux avant la fin ne corrige rien', async () => {
    seedAttempt();
    const deadline = await submitExam(context(), ATTEMPT, { trigger: 'deadline' });
    expect(deadline).toMatchObject({
      ok: true,
      value: { status: 'in_progress', timedOut: false, outcome: null },
    });
    const lazy = await submitExam(context(), ATTEMPT, { trigger: 'lazy' });
    expect(lazy).toMatchObject({
      ok: true,
      value: { status: 'in_progress', outcome: null },
    });
    expect(state.attempts[0]?.status).toBe('in_progress');
    expect(mocks.applyLearningResult).not.toHaveBeenCalled();
  });

  it('CA-2 — une soumission après l’échéance est marquée expirée', async () => {
    seedAttempt({
      deadlineAt: '2026-11-11T12:10:00Z',
      answers: [
        { position: 1, response: { optionIds: ['a'] } },
        { position: 2, response: {} },
        { position: 3, response: {} },
      ],
    });
    const submitted = await submitExam(context(), ATTEMPT, { trigger: 'manual' });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.value).toMatchObject({
      status: 'graded',
      unansweredCount: 2,
      timedOut: true,
    });
    expect(state.attempts[0]?.status).toBe('graded');
    const result = await getExamResult(context(), ATTEMPT);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timedOut).toBe(true);
  });

  it('ET-5 — corrige les textes à trous, associations et questions ouvertes sans réponse', async () => {
    const matchingVersion = VERSION_2;
    const publicMatching = toPublicBrick({
      brickId: BRICK_2,
      versionId: matchingVersion,
      type: 'matching',
      notionIds: [NOTION_2],
      payload: MATCHING_PAYLOAD,
    }).publicPayload as { rights: { id: string; text: string }[] };
    const rightOf = (text: string) =>
      publicMatching.rights.find((right) => right.text === text)?.id ?? '';
    seedAttempt({
      items: [
        questionItem(
          1,
          MODULE_1,
          1,
          'Module 1',
          NOTION_1,
          'Notion 1',
          VERSION_1,
          'cloze',
          CLOZE_PAYLOAD,
          true,
        ),
        questionItem(
          2,
          MODULE_1,
          1,
          'Module 1',
          NOTION_2,
          'Notion 2',
          matchingVersion,
          'matching',
          MATCHING_PAYLOAD,
          true,
        ),
        questionItem(
          3,
          MODULE_2,
          2,
          'Module 2',
          NOTION_3,
          'Notion 3',
          VERSION_3,
          'open_question',
          OPEN_PAYLOAD,
          false,
        ),
      ],
      config: {
        threshold: 70,
        durationSec: 1_200,
        questionCount: 3,
        examFormat: DEFAULT_CONFIG.examFormat,
        diagnosticPositions: [3],
        modules: DEFAULT_CONFIG.modules,
      },
      answers: [
        { position: 1, response: { gaps: { '1': 'produits', '2': 'charges' } } },
        {
          position: 2,
          response: {
            pairs: { a: rightOf('Ventes'), b: rightOf('Trésorerie') },
          },
        },
        { position: 3, response: { text: 'Chaque flux est enregistré deux fois.' } },
      ],
    });
    const submitted = await submitExam(context(), ATTEMPT);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const outcome = submitted.value.outcome;
    expect(outcome).not.toBeNull();
    expect(outcome?.review.map((row) => row.typeLabel)).toEqual([
      'Texte à trous',
      'Association',
      'Question',
    ]);
    expect(outcome?.review[0]).toMatchObject({ isCorrect: true });
    expect(outcome?.review[2]).toMatchObject({ isCorrect: false, given: 'réponse incomplète' });
  });

  it('refuse un résultat dont la tentative n’est pas encore corrigée', async () => {
    seedAttempt();
    await expect(getExamResult(context(), ATTEMPT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    await expect(getExamResult(context(), 'pas-un-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('ET-5 — reconstruit la réponse attendue depuis le payload si la correction manque', async () => {
    seedAttempt({
      items: [
        questionItem(
          1,
          MODULE_1,
          1,
          'Module 1',
          NOTION_1,
          'Notion 1',
          VERSION_1,
          'choice_question',
          choicePayload('la notion 1'),
          true,
        ),
        questionItem(
          2,
          MODULE_1,
          1,
          'Module 1',
          NOTION_2,
          'Notion 2',
          VERSION_2,
          'cloze',
          CLOZE_PAYLOAD,
          true,
        ),
        questionItem(
          3,
          MODULE_2,
          2,
          'Module 2',
          NOTION_3,
          'Notion 3',
          VERSION_3,
          'matching',
          MATCHING_PAYLOAD,
          false,
        ),
      ],
      answers: [
        { position: 1, response: { optionIds: ['inconnue'] } },
        { position: 2, response: { gaps: { '9': 'inconnue' } } },
        { position: 3, response: { pairs: { a: 'r999' } } },
      ],
    });
    const submitted = await submitExam(context(), ATTEMPT);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    const review = submitted.value.outcome?.review ?? [];
    expect(review[0]).toMatchObject({
      isCorrect: false,
      given: 'réponse incomplète',
      expected: 'La règle exacte',
    });
    expect(review[1]?.expected).toBe('. produits, . charges');
    expect(review[2]?.expected).toBe('Facture → Ventes, Relevé → Trésorerie');
  });

  it('ignore les questions sans ligne de réponse à la soumission', async () => {
    seedAttempt({ answers: [{ position: 1, response: { optionIds: ['a'] } }] });
    const submitted = await submitExam(context(), ATTEMPT);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.value).toMatchObject({ unansweredCount: 2 });
    expect(submitted.value.outcome?.review).toHaveLength(1);
  });

  it('CA-2 — un résultat lu après l’échéance déclenche la correction paresseuse', async () => {
    seedAttempt({ deadlineAt: '2026-11-11T12:10:00Z' });
    const result = await getExamResult(context(), ATTEMPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('graded');
    expect(result.value.timedOut).toBe(true);
    expect(result.value.total).toBe(3);
  });

  it('signale un échec de projection d’apprentissage sans perdre la correction', async () => {
    mocks.applyLearningResult.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR' },
    });
    seedAttempt();
    const submitted = await submitExam(context(), ATTEMPT);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.value.status).toBe('graded');
    expect(mocks.warn).toHaveBeenCalledWith('exam.learning.failed', {
      outcome: 'INTERNAL_ERROR',
    });
  });
});
