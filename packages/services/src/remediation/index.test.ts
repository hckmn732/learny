// Unit tests of the targeted remediation of SPEC-612 (EF-6, ET-2, ET-4, ET-5). The transaction and
// the user database are fakes routed by SQL text; the tutor, the attempt reader, the retry gate and
// the learning replay are mocked. These tests pin the outcome matrix (none, ready, preparing,
// in_progress, completed), the persisted plan and the question selection, not SQL.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock, silentLogger } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import {
  completeRemediation,
  defaultRemediationPlanGenerator,
  getRemediation,
  prepareRemediation,
  RemediationPlanSchema,
  requestRemediationPreparation,
} from './index';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const REMEDIATION_ATTEMPT = '55555555-5555-4555-8555-555555555555';
const ACTIVITY = '66666666-6666-4666-8666-666666666666';
const N1 = '77777777-7777-4777-8777-777777777777';
const N2 = '88888888-8888-4888-8888-888888888888';
const B1 = '99999999-9999-4999-8999-999999999999';
const V1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const B3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const V3 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const B4 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const V4 = '12121212-1212-4212-8212-121212121212';
const NOW = new Date('2026-11-11T12:20:00Z');

const session = vi.hoisted(() => vi.fn());
vi.mock('@learny/llm', () => ({ llm: { session } }));

const withTransaction = vi.hoisted(() => vi.fn());
vi.mock('@learny/jobs', () => ({ withTransaction }));

const getAttempt = vi.hoisted(() => vi.fn());
vi.mock('../quiz/check', () => ({ getAttempt }));

const retryGate = vi.hoisted(() => vi.fn());
vi.mock('../quiz/retry-gate', () => ({ retryGate }));

const applyLearningResult = vi.hoisted(() => vi.fn());
vi.mock('../learning/apply-result', () => ({ applyLearningResult }));

const serviceDb = vi.hoisted(() => vi.fn());
vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@learny/db')>()),
  serviceDb,
}));

/** Text of a Drizzle `sql` template, whatever the runtime shape of its chunks. */
function textOf(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] } | null)?.queryChunks ?? [];
  return chunks
    .map((chunk) => {
      if (typeof chunk === 'string') return chunk;
      const value = (chunk as { value?: unknown }).value;
      if (Array.isArray(value)) return value.join('');
      return typeof value === 'string' ? value : '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Rows {
  modules?: unknown[];
  failed?: unknown[];
  existing?: () => unknown[];
  automation?: unknown[];
  gaps?: unknown[];
  bank?: unknown[];
  seen?: unknown[];
  excerpts?: unknown[];
  latest?: unknown[];
  inserted?: unknown[];
  attempts?: unknown[];
  unchecked?: unknown[];
  scores?: unknown[];
}

function executeOf(rows: Rows = {}) {
  return vi.fn((query: unknown): Promise<unknown[]> => {
    const text = textOf(query);
    if (text.includes('from public.automation_settings'))
      return Promise.resolve(rows.automation ?? []);
    if (text.includes("act.kind = 'validation_quiz'") && text.includes('at.passed = false')) {
      return Promise.resolve(rows.failed ?? []);
    }
    if (text.includes("(act.config ->> 'sourceAttemptId')")) {
      return Promise.resolve(rows.existing?.() ?? []);
    }
    if (text.includes('ns.gap_cleared_at is null')) return Promise.resolve(rows.gaps ?? []);
    if (text.includes("b.purpose = 'bank'")) return Promise.resolve(rows.bank ?? []);
    if (text.includes('select distinct bv.fingerprint')) return Promise.resolve(rows.seen ?? []);
    if (text.includes('from public.citations ci')) return Promise.resolve(rows.excerpts ?? []);
    if (text.startsWith('insert into public.activities'))
      return Promise.resolve(rows.inserted ?? []);
    if (text.startsWith('insert into public.attempts')) return Promise.resolve(rows.attempts ?? []);
    if (text.startsWith('insert into public.answers')) return Promise.resolve([]);
    if (text.startsWith('update public.activities') || text.startsWith('update public.attempts')) {
      return Promise.resolve([]);
    }
    if (text.includes('from public.answers') && text.includes('graded_by is null')) {
      return Promise.resolve(rows.unchecked ?? []);
    }
    if (text.includes('select max_score::text as max_score'))
      return Promise.resolve(rows.scores ?? []);
    if (text.includes("act.kind = 'remediation'")) return Promise.resolve(rows.latest ?? []);
    if (text.includes('from public.modules m') && text.includes('join public.formations f')) {
      return Promise.resolve(rows.modules ?? []);
    }
    throw new Error(`Requête non routée : ${text}`);
  });
}

function context(execute: ReturnType<typeof vi.fn>, overrides: Partial<ServiceContext> = {}) {
  return {
    userId: USER,
    requestId: 'req-remediation',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: silentLogger(),
    ...overrides,
  } satisfies ServiceContext;
}

beforeEach(() => {
  serviceDb.mockReturnValue({});
  withTransaction.mockImplementation(
    async (db: UserDatabase, fn: (tx: unknown, box: unknown) => Promise<unknown>) =>
      db.run((tx) => fn(tx, { add: vi.fn() })),
  );
});

const moduleRow = {
  id: MODULE,
  formation_id: FORMATION,
  position: 1,
  title: 'Module 1',
};

const failedAttempt = { id: ATTEMPT, formation_id: FORMATION };

const gapConfusion = {
  notion_id: N1,
  label: 'Partie double',
  nature: 'confusion',
  evidence: 'Confondue avec le débit.',
  mastery: '10',
  confused_with: N2,
};

const gapForgetting = {
  notion_id: N2,
  label: 'Débit',
  nature: 'forgetting',
  evidence: null,
  mastery: '20',
  confused_with: null,
};

const choicePayload = {
  stem: 'Quelle écriture est équilibrée ?',
  mode: 'single',
  options: [
    { id: 'a', text: 'Débit = crédit', correct: true, notionId: N1, rationale: 'Équilibre.' },
    { id: 'b', text: 'Débit seul', correct: false, notionId: N2, rationale: 'Non.' },
  ],
  explanation: 'La partie double équilibre chaque flux enregistré.',
  objective: 'Reconnaître une écriture équilibrée',
  sources: [],
};

function bankRow(overrides: Record<string, unknown>) {
  return {
    brick_id: B1,
    version_id: V1,
    type: 'choice_question',
    notion_ids: [N1],
    payload: choicePayload,
    fingerprint: null,
    ...overrides,
  };
}

function excerptRow() {
  return {
    citation_id: '13131313-1313-4313-8313-131313131313',
    label: 'Partie double',
    section_id: '14141414-1414-4414-8414-141414141414',
    anchor: 'partie-double',
    chapter_id: '15151515-1515-4515-8515-151515151515',
    course_id: '16161616-1616-4616-8616-161616161616',
  };
}

function latestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVITY,
    status: 'ready',
    config: {
      plan: [
        {
          notionId: N1,
          label: 'Partie double',
          nature: 'confusion',
          natureLabel: 'Confusion',
          textMd: 'Un texte tuteur.',
          proposal: 'une question qui oppose les deux notions.',
          excerpts: [{ label: 'Partie double', href: '/formations/f/modules/m/cours#a' }],
        },
      ],
    },
    attempt_id: REMEDIATION_ATTEMPT,
    attempt_status: 'in_progress',
    checked: 0,
    preparing: false,
    ...overrides,
  };
}

function existingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVITY,
    status: 'ready',
    attempt_id: REMEDIATION_ATTEMPT,
    attempt_status: 'in_progress',
    checked: 0,
    preparing: false,
    ...overrides,
  };
}

function plan() {
  return {
    items: [
      {
        notionId: N1,
        textMd: 'Reprendre la partie double.',
        proposal: 'une question qui oppose les deux notions.',
        excerptCitationIds: [excerptRow().citation_id],
      },
    ],
  };
}

describe('[SPEC-612] remédiation ciblée', () => {
  it('refuse un appelant anonyme, un identifiant invalide et un module introuvable (CL-5)', async () => {
    await expect(
      prepareRemediation(context(vi.fn(), { userId: null, db: null }), MODULE),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    await expect(prepareRemediation(context(vi.fn()), 'not-a-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(
      prepareRemediation(context(executeOf({ modules: [] })), MODULE),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ne prépare rien automatiquement sans tentative échouée, mais refuse la demande manuelle', async () => {
    const execute = executeOf({ modules: [moduleRow], failed: [] });
    await expect(
      prepareRemediation(context(execute), MODULE, { trigger: 'auto' }),
    ).resolves.toEqual({
      ok: true,
      value: { status: 'none', activityId: null, prepared: false, fallback: false },
    });
    await expect(prepareRemediation(context(execute), MODULE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NO_FAILED_ATTEMPT' },
    });
  });

  it('restitue une remédiation déjà prête ou terminée sans regénérer (CL-2, CL-9)', async () => {
    const ready = executeOf({
      modules: [moduleRow],
      failed: [failedAttempt],
      existing: () => [existingRow()],
    });
    await expect(prepareRemediation(context(ready), MODULE)).resolves.toEqual({
      ok: true,
      value: { status: 'ready', activityId: ACTIVITY, prepared: false, fallback: false },
    });

    for (const [row, status] of [
      [existingRow({ attempt_status: 'graded', checked: 2 }), 'completed'],
      [existingRow({ checked: 1 }), 'in_progress'],
    ] as const) {
      const execute = executeOf({
        modules: [moduleRow],
        failed: [failedAttempt],
        existing: () => [row],
      });
      await expect(prepareRemediation(context(execute), MODULE)).resolves.toMatchObject({
        ok: true,
        value: { status },
      });
    }
  });

  it('respecte l’automatisme 4 désactivé et l’absence de lacune (CL-6, BR-AUT-01)', async () => {
    const disabled = executeOf({
      modules: [moduleRow],
      failed: [failedAttempt],
      automation: [{ enabled: false }],
    });
    await expect(
      prepareRemediation(context(disabled), MODULE, { trigger: 'auto' }),
    ).resolves.toMatchObject({ ok: true, value: { status: 'none' } });

    const noGap = executeOf({
      modules: [moduleRow],
      failed: [failedAttempt],
      automation: [{ enabled: true }],
      gaps: [],
    });
    await expect(prepareRemediation(context(noGap), MODULE)).resolves.toMatchObject({
      ok: true,
      value: { status: 'none' },
    });
  });

  it('persiste le plan, les extraits, les questions et la tentative (ET-4, CL-9)', async () => {
    const execute = executeOf({
      modules: [moduleRow],
      failed: [failedAttempt],
      gaps: [gapConfusion, gapForgetting],
      bank: [
        bankRow({}),
        bankRow({
          brick_id: B2,
          version_id: V2,
          payload: { ...choicePayload, options: choicePayload.options.slice(0, 2) },
        }),
        bankRow({
          brick_id: B3,
          version_id: V3,
          type: 'timer',
          notion_ids: [N2],
        }),
        bankRow({
          brick_id: B4,
          version_id: V4,
          type: 'cloze',
          notion_ids: [N2],
          payload: {},
        }),
        bankRow({
          brick_id: '17171717-1717-4717-8717-171717171717',
          version_id: '18181818-1818-4818-8818-181818181818',
          fingerprint: 'already-seen',
        }),
      ],
      seen: [{ fingerprint: 'already-seen' }],
      excerpts: [excerptRow()],
      inserted: [{ id: ACTIVITY }],
      attempts: [{ id: REMEDIATION_ATTEMPT }],
    });
    const generator = vi.fn().mockResolvedValue({ ok: true, value: plan() });

    const result = await prepareRemediation(context(execute), MODULE, { generator });

    expect(result).toEqual({
      ok: true,
      value: { status: 'ready', activityId: ACTIVITY, prepared: true, fallback: false },
    });
    expect(generator).toHaveBeenCalledTimes(1);
    const [planContext, planInput] = generator.mock.calls[0] as [
      { formationId: string; requestId: string },
      { gaps: { notionId: string; natureLabel: string; evidence: string }[] },
    ];
    expect(planContext).toMatchObject({ formationId: FORMATION, requestId: 'req-remediation' });
    expect(planInput.gaps).toEqual([
      expect.objectContaining({ notionId: N1, natureLabel: 'Confusion' }),
      expect.objectContaining({ notionId: N2, natureLabel: 'Oubli', evidence: '' }),
    ]);
    const insert = execute.mock.calls.find(([query]) =>
      textOf(query).startsWith('insert into public.activities'),
    );
    expect(insert).toBeDefined();
    expect(textOf(insert?.[0])).toContain('remediation');
  });

  it('reprend le plan persisté si une préparation concurrente a gagné (CL-9)', async () => {
    let call = 0;
    const execute = executeOf({
      modules: [moduleRow],
      failed: [failedAttempt],
      gaps: [gapConfusion],
      bank: [bankRow({})],
      existing: () => {
        call += 1;
        return call === 1 ? [] : [existingRow({ preparing: true })];
      },
    });

    await expect(
      prepareRemediation(context(execute), MODULE, {
        generator: vi.fn().mockResolvedValue({ ok: true, value: plan() }),
      }),
    ).resolves.toEqual({
      ok: true,
      value: { status: 'preparing', activityId: ACTIVITY, prepared: false, fallback: false },
    });
    expect(
      execute.mock.calls.some(([query]) =>
        textOf(query).startsWith('insert into public.activities'),
      ),
    ).toBe(false);
  });

  it('replie sur le texte de secours quand le tuteur échoue ou lève (CL-5)', async () => {
    const rows: Rows = {
      modules: [moduleRow],
      failed: [failedAttempt],
      gaps: [gapConfusion],
      bank: [bankRow({})],
      inserted: [{ id: ACTIVITY }],
      attempts: [{ id: REMEDIATION_ATTEMPT }],
    };
    const failed = await prepareRemediation(context(executeOf(rows)), MODULE, {
      generator: vi.fn().mockResolvedValue({ ok: false, error: { code: 'AI_UNAVAILABLE' } }),
    });
    expect(failed).toMatchObject({ ok: true, value: { status: 'ready', fallback: true } });

    const warn = vi.fn();
    const thrown = await prepareRemediation(
      context(executeOf(rows), { logger: { warn } as never }),
      MODULE,
      {
        generator: vi.fn().mockRejectedValue(new Error('panne')),
      },
    );
    expect(thrown).toMatchObject({ ok: true, value: { status: 'ready', fallback: true } });
    expect(warn).toHaveBeenCalledWith(
      'remediation.plan.failed',
      { outcome: 'ai_task_failed' },
      expect.any(Error),
    );
  });

  it('lit la remédiation courante : absente, archivée, prête, en cours, terminée (ET-2, CL-12)', async () => {
    retryGate.mockResolvedValue({
      ok: true,
      value: { allowed: true, availableAt: null, reason: null },
    });

    await expect(
      getRemediation(context(executeOf({ modules: [moduleRow] })), 'not-a-uuid'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const none = await getRemediation(
      context(executeOf({ modules: [moduleRow], latest: [] })),
      MODULE,
    );
    expect(none).toMatchObject({
      ok: true,
      value: { status: 'none', activityId: null, attemptId: null, gaps: [] },
    });

    const archived = await getRemediation(
      context(executeOf({ modules: [moduleRow], latest: [latestRow({ status: 'archived' })] })),
      MODULE,
    );
    expect(archived).toMatchObject({ ok: true, value: { status: 'none' } });

    getAttempt.mockResolvedValue({
      ok: true,
      value: {
        questions: [
          {
            position: 1,
            brickVersionId: V1,
            type: 'choice_question',
            typeLabel: 'Question à choix',
            notionId: N1,
            notionLabel: 'Partie double',
            payload: {},
            state: 'unanswered',
            maxScore: 100,
          },
        ],
      },
    });
    const completed = await getRemediation(
      context(
        executeOf({
          modules: [moduleRow],
          latest: [latestRow({ attempt_status: 'graded', checked: 1 })],
        }),
      ),
      MODULE,
    );
    expect(completed).toMatchObject({
      ok: true,
      value: {
        status: 'completed',
        activityId: ACTIVITY,
        attemptId: REMEDIATION_ATTEMPT,
        retryAvailableAt: null,
      },
    });
    expect(completed.ok && completed.value.gaps[0]?.questions).toHaveLength(1);

    for (const [row, status] of [
      [latestRow({ preparing: true }), 'preparing'],
      [latestRow({ checked: 1 }), 'in_progress'],
      [latestRow(), 'ready'],
    ] as const) {
      const read = await getRemediation(
        context(executeOf({ modules: [moduleRow], latest: [row] })),
        MODULE,
      );
      expect(read).toMatchObject({ ok: true, value: { status } });
    }
  });

  it('ignore la garde de tentative quand elle échoue (CA-5)', async () => {
    retryGate.mockResolvedValue({ ok: false, error: { code: 'INTERNAL_ERROR' } });
    getAttempt.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND' } });
    const read = await getRemediation(
      context(executeOf({ modules: [moduleRow], latest: [latestRow()] })),
      MODULE,
    );
    expect(read).toMatchObject({ ok: true, value: { retryAvailableAt: null } });
  });

  it('demande la préparation explicite et publie l’événement (ET-2)', async () => {
    const outbox = { add: vi.fn() };
    withTransaction.mockImplementation(
      async (db: UserDatabase, fn: (tx: unknown, box: unknown) => Promise<unknown>) =>
        db.run((tx) => fn(tx, outbox)),
    );

    await expect(
      requestRemediationPreparation(
        context(executeOf({ modules: [moduleRow], failed: [] })),
        MODULE,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NO_FAILED_ATTEMPT' } });

    for (const row of [
      existingRow({ attempt_status: 'graded' }),
      existingRow({ preparing: false }),
    ]) {
      await expect(
        requestRemediationPreparation(
          context(
            executeOf({ modules: [moduleRow], failed: [failedAttempt], existing: () => [row] }),
          ),
          MODULE,
        ),
      ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    }

    await expect(
      requestRemediationPreparation(
        context(
          executeOf({
            modules: [moduleRow],
            failed: [failedAttempt],
            existing: () => [existingRow({ preparing: true })],
          }),
        ),
        MODULE,
      ),
    ).resolves.toEqual({ ok: true, value: { status: 'preparing' } });

    const execute = executeOf({ modules: [moduleRow], failed: [failedAttempt] });
    await expect(requestRemediationPreparation(context(execute), MODULE)).resolves.toEqual({
      ok: true,
      value: { status: 'preparing' },
    });
    expect(
      execute.mock.calls.some(([query]) =>
        textOf(query).startsWith('insert into public.activities'),
      ),
    ).toBe(true);
    expect(outbox.add).toHaveBeenCalledWith(
      'remediation/requested',
      { userId: USER, formationId: FORMATION, moduleId: MODULE, attemptId: ATTEMPT },
      { id: `remediation-requested:${ATTEMPT}` },
    );
  });

  it('termine la remédiation quand toutes les questions sont vérifiées (ET-2, CA-6)', async () => {
    retryGate.mockResolvedValue({
      ok: true,
      value: { allowed: true, availableAt: '2026-11-12T12:20:00.000Z', reason: null },
    });
    applyLearningResult.mockResolvedValue({ ok: true, value: undefined });

    await expect(
      completeRemediation(context(executeOf({ latest: [] })), 'not-a-uuid'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    await expect(
      completeRemediation(context(executeOf({ latest: [] })), MODULE),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    await expect(
      completeRemediation(
        context(executeOf({ latest: [latestRow({ attempt_id: null })] })),
        MODULE,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    await expect(
      completeRemediation(
        context(
          executeOf({
            latest: [latestRow({ attempt_status: 'graded' })],
          }),
        ),
        MODULE,
      ),
    ).resolves.toEqual({
      ok: true,
      value: { retryAvailableAt: '2026-11-12T12:20:00.000Z' },
    });

    await expect(
      completeRemediation(
        context(executeOf({ latest: [latestRow({ attempt_status: 'abandoned' })] })),
        MODULE,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    await expect(
      completeRemediation(
        context(executeOf({ latest: [latestRow()], unchecked: [{ position: 2 }] })),
        MODULE,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        errors: [expect.objectContaining({ code: 'QUESTION_UNCHECKED' })],
      },
    });

    const execute = executeOf({
      latest: [latestRow()],
      scores: [
        { max_score: '50', score: '40' },
        { max_score: '50', score: '40' },
      ],
    });
    await expect(completeRemediation(context(execute), MODULE)).resolves.toEqual({
      ok: true,
      value: { retryAvailableAt: '2026-11-12T12:20:00.000Z' },
    });
    expect(applyLearningResult).toHaveBeenCalledWith(expect.anything(), REMEDIATION_ATTEMPT);

    applyLearningResult.mockResolvedValue({ ok: false, error: { code: 'CONFLICT' } });
    await expect(
      completeRemediation(context(executeOf({ latest: [latestRow()] })), MODULE),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('génère le plan du tuteur, aligne les notions et propage les échecs (ET-4)', async () => {
    const input = {
      gaps: [
        {
          notionId: N1,
          label: 'Partie <double>',
          nature: 'confusion',
          natureLabel: 'Confusion',
          evidence: 'Confondue & mal appliquée.',
        },
      ],
    };
    const planCtx = {
      userId: USER,
      formationId: FORMATION,
      requestId: 'req-plan',
      llmDb: {} as never,
    };

    const object = vi.fn(() =>
      Promise.resolve({
        ok: true,
        value: {
          items: [
            {
              notionId: 'unknown',
              textMd: 'Un autre angle.',
              proposal: 'une question qui oppose les deux notions.',
              excerptCitationIds: [],
            },
          ],
        },
      }),
    );
    session.mockResolvedValueOnce({ ok: true, value: { object } });
    await expect(defaultRemediationPlanGenerator(planCtx, input)).resolves.toEqual({
      ok: true,
      value: {
        items: [
          {
            notionId: N1,
            textMd: 'Un autre angle.',
            proposal: 'une question qui oppose les deux notions.',
            excerptCitationIds: [],
          },
        ],
      },
    });
    expect(session.mock.calls.at(-1)?.[1]).toMatchObject({
      promptId: 'tutor.remediation-plan',
      mock: { scenario: 'remediation-plan' },
    });
    const prompt = object.mock.calls[0]?.[0] as { messages: { content: string }[] };
    expect(prompt.messages[0]?.content).toContain('&lt;double&gt;');

    session.mockResolvedValueOnce({ ok: false, error: { code: 'AI_UNAVAILABLE' } });
    await expect(defaultRemediationPlanGenerator(planCtx, input)).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_UNAVAILABLE' },
    });

    session.mockResolvedValueOnce({
      ok: true,
      value: { object: () => Promise.resolve({ ok: false, error: { code: 'AI_UNAVAILABLE' } }) },
    });
    await expect(defaultRemediationPlanGenerator(planCtx, input)).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_UNAVAILABLE' },
    });

    session.mockResolvedValueOnce({
      ok: true,
      value: { object: () => Promise.resolve({ ok: true, value: { items: [] } }) },
    });
    await expect(defaultRemediationPlanGenerator(planCtx, input)).resolves.toMatchObject({
      ok: false,
      error: { code: 'INVALID_OUTPUT' },
    });
  });

  it('borne le plan du tuteur (ADR-0173)', () => {
    expect(RemediationPlanSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      RemediationPlanSchema.safeParse({
        items: [{ notionId: N1, textMd: 'x'.repeat(1_201), proposal: 'ok' }],
      }).success,
    ).toBe(false);
    expect(
      RemediationPlanSchema.parse({
        items: [{ notionId: N1, textMd: 'Un texte.', proposal: 'Une phrase.' }],
      }).items[0]?.excerptCitationIds,
    ).toEqual([]);
  });
});
