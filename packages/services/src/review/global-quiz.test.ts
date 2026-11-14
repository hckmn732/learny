// Unit tests of the daily global quiz service (SPEC-701 EF-1 to EF-13, ET-3, ET-5; BR-MEM-03 to
// BR-MEM-10, ADR-0180, ADR-0319).
//
// The transaction is a fake that dispatches on the SQL text: no database is touched and no clock is
// read from the machine (ADR-0047). The tests pin the read/create/replay contract of the day, the
// paused/empty/404 states, the brick grouping and its refill request, the idempotent answer and the
// closure summary. The real SQL, the advisory lock and RLS stay pinned by the integration suites.
import { describe, expect, it } from 'vitest';

import { brickExamples, opaqueMapping } from '@learny/bricks';
import type { DbTx } from '@learny/db';

import { TestClock, sqlText } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { answerReviewItem, completeReviewSession, getOrCreateTodaySession } from './global-quiz';

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FORMATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MODULE_A = 'c0000000-0000-4000-8000-000000000001';
const MODULE_B = 'c0000000-0000-4000-8000-000000000002';
const NOTION_A = '11111111-1111-4111-8111-111111111111';
const NOTION_B = '22222222-2222-4222-8222-222222222222';
const BRICK_A = 'a0000000-0000-4000-8000-000000000001';
const VERSION_A = 'a0000000-0000-4000-8000-000000000002';
const BRICK_B = 'a0000000-0000-4000-8000-000000000003';
const VERSION_B = 'a0000000-0000-4000-8000-000000000004';
const BRICK_MATCH = 'a0000000-0000-4000-8000-000000000005';
const VERSION_MATCH = 'a0000000-0000-4000-8000-000000000006';
const ACTIVITY = 'a0000000-0000-4000-8000-000000000007';
const ATTEMPT = 'a0000000-0000-4000-8000-000000000008';
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

function context(fake: FakeTx): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-global-quiz',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow(fake.tx) } as never,
    clock: new TestClock(AT),
    logger: {} as never,
  };
}

function formationRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: FORMATION, title: 'Comptabilité générale', status: 'active', ...overrides };
}

function dueRow(
  notionId: string,
  label: string,
  moduleId: string,
  modulePosition: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    notion_id: notionId,
    label,
    module_id: moduleId,
    module_position: modulePosition,
    in_review: true,
    due_at: '2026-11-10T08:00:00Z',
    gap_nature: null,
    gap_detected_at: null,
    fsrs: null,
    ...overrides,
  };
}

function firstRow<T>(rows: readonly T[]): T {
  const [first] = rows;
  if (first === undefined) throw new Error('fixture absente');
  return first;
}

function engineNotion(
  row: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    notion_id: row.notion_id,
    label: row.label,
    chapter_id: 'd0000000-0000-4000-8000-000000000001',
    module_id: row.module_id,
    module_position: row.module_position,
    module_status: 'validated',
    evaluated: true,
    due_at: row.due_at,
    mastery: '0.8',
    gap_nature: row.gap_nature,
    ...overrides,
  };
}

function brickRow(
  brickId: string,
  versionId: string,
  type: string,
  notionIds: string[],
  payload: unknown,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    brick_id: brickId,
    version_id: versionId,
    type,
    notion_ids: notionIds,
    payload,
    status: 'active',
    fingerprint: null,
    origin: 'tutor',
    ...overrides,
  };
}

const recallPayload = brickExamples.recall_card.valid;
const matchingPayload = {
  ...brickExamples.matching.valid,
  instruction: 'Notions de base SAP : reliez chaque document au bon cycle.',
};

const SESSION_CONFIG = {
  mode: 'full' as const,
  forDate: '2026-11-11',
  dueCount: 2,
  deferredCount: 0,
  deferredTo: '2026-11-12',
  capMinutes: 45,
  estimatedSec: 120,
  rationale: [],
  items: [
    {
      position: 0,
      format: 'recall_card',
      reasonKey: null,
      displayLabel: 'Le principe de la partie double',
      moduleIds: [MODULE_A],
      notionIds: [NOTION_A],
    },
    {
      position: 1,
      format: 'recall_card',
      reasonKey: null,
      displayLabel: 'Le cycle des ventes',
      moduleIds: [MODULE_B],
      notionIds: [NOTION_B],
    },
  ],
};

function notionRow(
  notionId: string,
  label: string,
  modulePosition: number,
): Record<string, unknown> {
  return {
    id: notionId,
    label,
    module_position: modulePosition,
    chapter_position: 1,
  };
}

function baseHandlers(options: {
  formation?: Record<string, unknown> | null;
  engineFormationMissing?: boolean;
  dueRows?: Record<string, unknown>[];
  engineRows?: Record<string, unknown>[];
  bricks?: Record<string, unknown>[];
  dtoBricks?: Record<string, unknown>[];
  existing?: Record<string, unknown> | null;
  existingOnReplay?: Record<string, unknown> | null;
  stale?: Record<string, unknown>[];
  automation?: Record<string, unknown>[];
  lastFormats?: Record<string, unknown>[];
  seenFingerprints?: Record<string, unknown>[];
  answerRows?: Record<string, unknown>[];
  cards?: Record<string, unknown>[];
  outcomes?: Record<string, unknown>[];
}): Handler[] {
  const dueRows = options.dueRows ?? [];
  const engineRows = options.engineRows ?? dueRows.map((row) => engineNotion(row));
  const bricks = options.bricks ?? [];
  const dtoBricks = options.dtoBricks ?? bricks;
  const formation = options.formation === undefined ? formationRow() : options.formation;
  const existing = options.existing ?? null;
  let activityReads = 0;
  return [
    (text) =>
      text.startsWith('select timezone from public.profiles')
        ? [{ timezone: 'Europe/Paris' }]
        : undefined,
    (text) =>
      text.includes('from public.formations f')
        ? formation === null
          ? []
          : [formation]
        : undefined,
    (text) =>
      text.includes('from public.formations where id')
        ? options.engineFormationMissing === true
          ? []
          : [{ id: FORMATION }]
        : undefined,
    (text) =>
      text.includes('join public.attempts at on at.activity_id = a.id and at.status =')
        ? (options.stale ?? [])
        : undefined,
    (text) => {
      if (!text.includes('left join lateral')) return undefined;
      activityReads += 1;
      if (activityReads > 1) {
        return options.existingOnReplay === undefined || options.existingOnReplay === null
          ? []
          : [options.existingOnReplay];
      }
      return existing === null ? [] : [existing];
    },
    (text) =>
      text.includes('chapter_id') && text.includes('from public.notion_states ns')
        ? engineRows
        : undefined,
    (text) =>
      text.includes('from public.notion_states ns join public.notions n') ? dueRows : undefined,
    (text) =>
      text.includes('from public.bricks b join public.brick_versions bv') ? bricks : undefined,
    (text) =>
      text.includes('select b.notion_ids::text[] as notion_ids, b.type::text as type')
        ? (options.lastFormats ?? [])
        : undefined,
    (text) =>
      text.includes('from public.automation_settings') ? (options.automation ?? []) : undefined,
    (text) =>
      text.includes('select distinct bv.fingerprint')
        ? (options.seenFingerprints ?? [])
        : undefined,
    (text) => (text.includes('pg_advisory_xact_lock') ? [] : undefined),
    (text) => (text.startsWith('insert into public.activities') ? [] : undefined),
    (text) =>
      text.startsWith('insert into public.attempts') && text.includes('(id, user_id, activity_id')
        ? []
        : undefined,
    (text) =>
      text.startsWith('select a.config, a.items')
        ? [
            {
              config: SESSION_CONFIG,
              items: [{ brickId: BRICK_A, brickVersionId: VERSION_A }],
            },
          ]
        : undefined,
    (text) => (text.startsWith('select position from public.answers') ? [] : undefined),
    (text) => (text.startsWith('insert into public.answers') ? [] : undefined),
    (text) => (text.startsWith('update public.attempts') ? [] : undefined),
    (text) => (text.startsWith('update public.activities') ? [] : undefined),
    (text) =>
      text.includes('from public.brick_versions bv join public.bricks b on b.id = bv.brick_id')
        ? dtoBricks
        : undefined,
    (text) =>
      text.includes('from public.answers where attempt_id =') && text.includes('order by position')
        ? (options.answerRows ?? [])
        : undefined,
    (text) =>
      text.includes('chapter_position')
        ? dueRows.map((row) =>
            notionRow(row.notion_id as string, row.label as string, row.module_position as number),
          )
        : undefined,
    (text) =>
      text.includes('select notion_id::text as notion_id, fsrs')
        ? (options.cards ?? [])
        : undefined,
    (text) => (text.includes('from public.review_logs rl') ? (options.outcomes ?? []) : undefined),
    (text) => (text.includes('from public.courses c') ? [] : undefined),
  ];
}

describe('[SPEC-701] session du jour du quiz global', () => {
  it('CL-1 — un identifiant de formation invalide est refusé sans lire la base', async () => {
    const fake = fakeTx([]);
    const result = await getOrCreateTodaySession(context(fake), 'pas-un-uuid', 'full');
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(fake.calls).toHaveLength(0);
  });

  it('EF-2 — une formation inaccessible est un 404', async () => {
    const fake = fakeTx(baseHandlers({ formation: null }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('EF-1 — une formation en pause rend le DTO paused sans écriture', async () => {
    const fake = fakeTx(baseHandlers({ formation: formationRow({ status: 'paused' }) }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionId: null,
        attemptId: null,
        formationId: FORMATION,
        status: 'paused',
        forDate: '2026-11-11',
        items: [],
      },
    });
    expect(fake.calls.some((text) => text.startsWith('insert into'))).toBe(false);
  });

  it('CL-10 — une formation terminée est servie par la maintenance, pas par le quiz', async () => {
    const fake = fakeTx(baseHandlers({ formation: formationRow({ status: 'completed' }) }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CL-1 — aucune notion due rend le DTO empty sans écriture', async () => {
    const fake = fakeTx(baseHandlers({ dueRows: [] }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({
      ok: true,
      value: { sessionId: null, status: 'empty', items: [], header: { notionCount: 0 } },
    });
    expect(fake.calls.some((text) => text.startsWith('insert into'))).toBe(false);
  });

  it('EF-3, EF-8 — deux notions recall_card forment deux jeux jouables', async () => {
    const dueRows = [
      dueRow(NOTION_A, 'Le principe de la partie double', MODULE_A, 1),
      dueRow(NOTION_B, 'Le cycle des ventes', MODULE_B, 2),
    ];
    const bricks = [
      brickRow(BRICK_A, VERSION_A, 'recall_card', [NOTION_A], recallPayload),
      brickRow(BRICK_B, VERSION_B, 'recall_card', [NOTION_B], recallPayload),
    ];
    const fake = fakeTx(baseHandlers({ dueRows, bricks }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: 'in_progress',
      formationId: FORMATION,
      forDate: '2026-11-11',
      mode: 'full',
      header: {
        notionCount: 2,
        modulesLabel: 'Modules 1 et 2 mêlés',
        subtitle: 'Comptabilité générale · session du mercredi 11 novembre',
      },
      note: '2 notions à revoir aujourd’hui, lacunes en priorité.',
      rationale: [
        { label: 'Modules mêlés', text: 'retrouver la bonne notion parmi d’autres la fixe mieux.' },
      ],
      currentPosition: 0,
    });
    expect(result.value.items).toHaveLength(2);
    expect(result.value.header.estimatedMinutes).toBeGreaterThanOrEqual(1);
    expect(result.value.items[0]).toMatchObject({
      position: 0,
      type: 'recall_card',
      name: 'Carte de rappel',
      displayLabel: 'Le principe de la partie double',
      scopeLabel: 'Module 1',
      state: 'todo',
      intervals: null,
      result: null,
    });
    expect(result.value.items[1]).toMatchObject({ scopeLabel: 'Module 2' });
    expect(result.value.sessionId).not.toBeNull();
    expect(result.value.attemptId).not.toBeNull();
    expect(fake.calls.some((text) => text.startsWith('insert into public.activities'))).toBe(true);
    expect(fake.calls.some((text) => text.startsWith('insert into public.attempts'))).toBe(true);
  });

  it('ADR-0319 §1 — une brique multi-notions regroupe les notions tirées dans un seul jeu', async () => {
    const dueRows = [
      dueRow(NOTION_A, 'Le cycle des ventes', MODULE_A, 1),
      dueRow(NOTION_B, 'Le cycle des achats', MODULE_B, 2),
    ];
    const bricks = [
      brickRow(BRICK_MATCH, VERSION_MATCH, 'matching', [NOTION_A, NOTION_B], matchingPayload),
    ];
    const fake = fakeTx(baseHandlers({ dueRows, bricks }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]).toMatchObject({
      type: 'matching',
      name: 'Association',
      displayLabel: 'Notions de base SAP',
      scopeLabel: 'Modules 1 et 2',
      notionIds: [NOTION_A, NOTION_B],
      state: 'todo',
    });
    expect(result.value.header.notionCount).toBe(2);
  });

  it('EF-7 — une lacune active place son jeu en tête et justifie la session', async () => {
    const dueRows = [
      dueRow(NOTION_A, 'La notion oubliée', MODULE_A, 1, {
        gap_nature: 'forgetting',
        gap_detected_at: '2026-11-04T08:00:00Z',
      }),
    ];
    const engineRows = [engineNotion(firstRow(dueRows), { gap_nature: 'forgetting' })];
    const bricks = [brickRow(BRICK_A, VERSION_A, 'recall_card', [NOTION_A], recallPayload)];
    const fake = fakeTx(baseHandlers({ dueRows, engineRows, bricks }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items[0]).toMatchObject({
      reason: 'Choisi pour votre oubli',
      displayLabel: 'La notion oubliée',
    });
    expect(result.value.rationale[0]?.label).toBe('Lacune en priorité');
    expect(result.value.rationale[0]?.text).toContain('revient en carte de rappel');
  });

  it('CL-7 — une banque épuisée rend le DTO empty et demande des variantes hors transaction', async () => {
    const dueRows = [
      dueRow(NOTION_A, 'La notion oubliée', MODULE_A, 1, {
        gap_nature: 'forgetting',
        gap_detected_at: '2026-11-04T08:00:00Z',
      }),
    ];
    const engineRows = [engineNotion(firstRow(dueRows), { gap_nature: 'forgetting' })];
    const bricks = [brickRow(BRICK_A, VERSION_A, 'matching', [NOTION_A], matchingPayload)];
    const fake = fakeTx(baseHandlers({ dueRows, engineRows, bricks }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({
      ok: true,
      value: { status: 'empty', sessionId: null, items: [] },
    });
    expect(fake.calls.some((text) => text.includes('from public.courses c'))).toBe(true);
    expect(fake.calls.some((text) => text.startsWith('insert into public.activities'))).toBe(false);
  });

  it('CL-2 — une session du jour existante est rejouée sans réécriture', async () => {
    const config = {
      mode: 'full',
      forDate: '2026-11-11',
      dueCount: 1,
      deferredCount: 0,
      deferredTo: '2026-11-12',
      capMinutes: 45,
      estimatedSec: 60,
      rationale: [],
      items: [
        {
          position: 0,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Le principe de la partie double',
          moduleIds: [MODULE_A],
          notionIds: [NOTION_A],
        },
      ],
    };
    const existing = {
      id: ACTIVITY,
      formation_id: FORMATION,
      config,
      items: [{ brickId: BRICK_A, brickVersionId: VERSION_A }],
      status: 'ready',
      for_date: '2026-11-11',
      attempt_id: ATTEMPT,
      attempt_no: 1,
      attempt_status: 'in_progress',
      started_at: '2026-11-11T08:00:00Z',
      review_feedback: null,
    };
    const fake = fakeTx(
      baseHandlers({
        existing,
        bricks: [brickRow(BRICK_A, VERSION_A, 'recall_card', [NOTION_A], recallPayload)],
        dueRows: [dueRow(NOTION_A, 'Le principe de la partie double', MODULE_A, 1)],
      }),
    );
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionId: ACTIVITY,
        attemptId: ATTEMPT,
        status: 'in_progress',
        items: [{ position: 0, state: 'todo' }],
      },
    });
    expect(fake.calls.some((text) => text.startsWith('insert into public.activities'))).toBe(false);
  });
  it('CL-2 — une session en cours de la veille est clôturée au premier chargement', async () => {
    const fake = fakeTx(
      baseHandlers({
        stale: [{ id: ACTIVITY, attempt_id: ATTEMPT }],
        dueRows: [],
      }),
    );
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({ ok: true, value: { status: 'empty' } });
    expect(fake.calls.some((text) => text.startsWith('insert into public.answers'))).toBe(true);
    expect(fake.calls.some((text) => text.startsWith('update public.attempts'))).toBe(true);
  });

  it('EF-4 — une charge lissée reporte les notions au-delà du plafond', async () => {
    const dueRows = [
      dueRow(NOTION_A, 'Le cycle des ventes', MODULE_A, 1),
      dueRow(NOTION_B, 'Le cycle des achats', MODULE_B, 2),
    ];
    const bricks = [
      brickRow(
        BRICK_A,
        VERSION_A,
        'choice_question',
        [NOTION_A],
        brickExamples.choice_question.valid,
      ),
      brickRow(
        BRICK_B,
        VERSION_B,
        'choice_question',
        [NOTION_B],
        brickExamples.choice_question.valid,
      ),
    ];
    const fake = fakeTx(
      baseHandlers({
        dueRows,
        bricks,
        automation: [
          { key: 'plafond_quiz', params: { maxMinutes: 2 } },
          { key: 'jeu_lacune', params: { preference: 'cards' } },
        ],
        lastFormats: [{ notion_ids: [NOTION_A], type: 'recall_card' }],
        seenFingerprints: [{ fingerprint: null }],
      }),
    );
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.note).toContain('est reportée à');
    expect(result.value.note).toContain('2 min');
    expect(result.value.rationale.map((entry) => entry.label)).toContain('Charge lissée');
    expect(result.value.modeOptions.fullMinutes).toBeGreaterThanOrEqual(1);
  });

  it('EF-2 — une formation disparue entre les deux lectures est un 404', async () => {
    const fake = fakeTx(
      baseHandlers({
        engineFormationMissing: true,
        dueRows: [dueRow(NOTION_A, 'Le principe de la partie double', MODULE_A, 1)],
      }),
    );
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CL-5 — une session créée entre-temps par un autre appel est rejouée', async () => {
    const existing = {
      id: ACTIVITY,
      formation_id: FORMATION,
      config: SESSION_CONFIG,
      items: [
        { brickId: BRICK_A, brickVersionId: VERSION_A },
        { brickId: BRICK_B, brickVersionId: VERSION_B },
      ],
      status: 'ready',
      for_date: '2026-11-11',
      attempt_id: ATTEMPT,
      attempt_no: 1,
      attempt_status: 'in_progress',
      started_at: '2026-11-11T08:00:00Z',
      review_feedback: null,
    };
    const dueRows = [
      dueRow(NOTION_A, 'Le principe de la partie double', MODULE_A, 1),
      dueRow(NOTION_B, 'Le cycle des ventes', MODULE_B, 2),
    ];
    const fake = fakeTx(
      baseHandlers({
        dueRows,
        existing: null,
        existingOnReplay: existing,
        bricks: [
          brickRow(BRICK_A, VERSION_A, 'recall_card', [NOTION_A], recallPayload),
          brickRow(BRICK_B, VERSION_B, 'recall_card', [NOTION_B], recallPayload),
        ],
        automation: [{ key: 'plafond_quiz', params: {} }],
      }),
    );
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({ ok: true, value: { sessionId: ACTIVITY, attemptId: ATTEMPT } });
    expect(fake.calls.some((text) => text.startsWith('insert into public.activities'))).toBe(false);
  });

  it('ET-6, EF-9 — une brique retirée et une réponse déjà donnée sont projetées', async () => {
    const existing = {
      id: ACTIVITY,
      formation_id: FORMATION,
      config: SESSION_CONFIG,
      items: [
        { brickId: BRICK_A, brickVersionId: VERSION_A },
        { brickId: BRICK_B, brickVersionId: VERSION_B },
      ],
      status: 'ready',
      for_date: '2026-11-11',
      attempt_id: ATTEMPT,
      attempt_no: 1,
      attempt_status: 'in_progress',
      started_at: '2026-11-11T08:00:00Z',
      review_feedback: null,
    };
    const dueRows = [
      dueRow(NOTION_A, 'Le principe de la partie double', MODULE_A, 1),
      dueRow(NOTION_B, 'Le cycle des ventes', MODULE_B, 2),
    ];
    const fake = fakeTx(
      baseHandlers({
        dueRows,
        existing,
        dtoBricks: [
          brickRow(BRICK_A, VERSION_A, 'recall_card', [NOTION_A], recallPayload),
          brickRow(BRICK_B, VERSION_B, 'recall_card', [NOTION_B], recallPayload, {
            status: 'retired',
          }),
        ],
        answerRows: [
          {
            id: 'e0000000-0000-4000-8000-000000000010',
            position: 1,
            is_correct: true,
            response: { selfGrade: 'good' },
            feedback: { correction: { explanation: 'Exact.' }, explanation: 'Exact.' },
            time_ms: 4200,
          },
        ],
        cards: [
          {
            notion_id: NOTION_A,
            fsrs: {
              due: '2026-11-10T08:00:00.000Z',
              stability: 3.2,
              difficulty: 5.1,
              elapsed_days: 2,
              scheduled_days: 3,
              reps: 2,
              lapses: 0,
              state: 2,
              last_review: '2026-11-07T08:00:00.000Z',
            },
          },
        ],
        outcomes: [
          {
            answer_id: 'e0000000-0000-4000-8000-000000000010',
            notion_id: NOTION_A,
            grade: 'good',
            due_at: '2026-12-01T08:00:00Z',
          },
        ],
      }),
    );
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    const item = result.value.items[0];
    expect(item).toMatchObject({ position: 0, state: 'answered' });
    expect(item?.intervals).not.toBeNull();
    expect(item?.intervals?.good).toBeTypeOf('string');
    expect(item?.result).toMatchObject({
      isCorrect: true,
      correction: { explanation: 'Exact.' },
      explanation: 'Exact.',
      notions: [{ notionId: NOTION_A, rating: 'good', nextDueAt: '2026-12-01T08:00:00.000Z' }],
    });
    expect(fake.calls.some((text) => text.startsWith('update public.activities'))).toBe(true);
    expect(result.value.currentPosition).toBe(2);
  });

  it('ET-5 — une configuration illisible est une erreur interne', async () => {
    const existing = {
      id: ACTIVITY,
      formation_id: FORMATION,
      config: { mode: 'full' },
      items: [],
      status: 'ready',
      for_date: '2026-11-11',
      attempt_id: ATTEMPT,
      attempt_no: 1,
      attempt_status: 'in_progress',
      started_at: '2026-11-11T08:00:00Z',
      review_feedback: null,
    };
    const fake = fakeTx(baseHandlers({ existing }));
    const result = await getOrCreateTodaySession(context(fake), FORMATION, 'full');
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });
});
describe('[SPEC-701] réponse et clôture de la session', () => {
  function sessionConfig(items: unknown[]): Record<string, unknown> {
    return {
      mode: 'full',
      forDate: '2026-11-11',
      dueCount: items.length,
      deferredCount: 0,
      deferredTo: '2026-11-12',
      capMinutes: 45,
      estimatedSec: 60 * items.length,
      rationale: [],
      items,
    };
  }

  function answerHandlers(options: {
    ownerId?: string;
    attemptStatus?: string;
    itemOverrides?: Record<string, unknown>;
    withdraw?: boolean;
    replay?: Record<string, unknown> | null;
    conflict?: boolean;
    brickType?: string;
    brickPayload?: unknown;
    notionIds?: string[];
    state?: Record<string, unknown> | null;
    config?: Record<string, unknown> | null;
    missingBrick?: boolean;
  }): Handler[] {
    const notionIds = options.notionIds ?? [NOTION_A];
    const item = {
      position: 0,
      format: options.brickType ?? 'recall_card',
      reasonKey: null,
      displayLabel: 'Le principe de la partie double',
      moduleIds: [MODULE_A],
      notionIds,
      ...(options.withdraw === true ? { withdrawn: true } : {}),
      ...options.itemOverrides,
    };
    const config = options.config === undefined ? sessionConfig([item]) : options.config;
    return [
      (text) =>
        text.includes('a.owner_id::text as owner_id') && text.includes('at.attempt_no')
          ? [
              {
                id: ACTIVITY,
                owner_id: options.ownerId ?? USER,
                items: [
                  {
                    brickId: BRICK_A,
                    brickVersionId: VERSION_A,
                  },
                ],
                config,
                formation_id: FORMATION,
                attempt_id: ATTEMPT,
                attempt_status: options.attemptStatus ?? 'in_progress',
                attempt_no: 1,
              },
            ]
          : undefined,
      (text) =>
        text.includes("feedback->>'clientAnswerId' =")
          ? options.replay === undefined || options.replay === null
            ? []
            : [options.replay]
          : undefined,
      (text) =>
        text.includes('and position = ')
          ? options.conflict === true
            ? [{ id: 'x' }]
            : []
          : undefined,
      (text) =>
        text.includes('select b.type::text as type, bv.payload, b.notion_ids')
          ? options.missingBrick === true
            ? []
            : [
                {
                  type: options.brickType ?? 'recall_card',
                  payload: options.brickPayload ?? recallPayload,
                  notion_ids: notionIds,
                },
              ]
          : undefined,
      (text) => (text.startsWith('insert into public.answers') ? [] : undefined),
      (text) =>
        text.includes('from public.notion_states where user_id =') && text.includes('for update')
          ? options.state === null || options.state === undefined
            ? []
            : [options.state]
          : undefined,
      (text) => (text.includes('and b.notion_ids @>') ? [] : undefined),
      (text) => (text.includes('a.time_ms is not null') ? [] : undefined),
      (text) => (text.startsWith('insert into public.notion_states') ? [] : undefined),
      (text) =>
        text.includes('public.append_review_log')
          ? [{ id: 'e0000000-0000-4000-8000-000000000001' }]
          : undefined,
      (text) => (text.includes('public.append_gap_event') ? [] : undefined),
      (text) => (text.includes('rl.answer_id =') ? [] : undefined),
    ];
  }

  it('EF-9 — une session inconnue est un 404', async () => {
    const fake = fakeTx([
      (text) =>
        text.includes('a.owner_id::text as owner_id') && text.includes('at.attempt_no')
          ? []
          : undefined,
    ]);
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      skipped: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('EF-9 — la session d’un autre apprenant est invisible', async () => {
    const fake = fakeTx(
      answerHandlers({ ownerId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', attemptStatus: 'graded' }),
    );
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      skipped: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('CL-6 — une tentative clôturée refuse toute réponse (422)', async () => {
    const fake = fakeTx(answerHandlers({ attemptStatus: 'graded' }));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      skipped: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_CLOSED', status: 422 } });
  });

  it('EF-9 — une position absente de la session est invalide', async () => {
    const fake = fakeTx(answerHandlers({}));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 4,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      skipped: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('ET-6 — un jeu retiré ne peut pas être répondu (409)', async () => {
    const fake = fakeTx(answerHandlers({ withdraw: true }));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      skipped: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', status: 409 } });
  });

  it('CL-5 — un clientAnswerId déjà enregistré rejoue le même résultat', async () => {
    const fake = fakeTx(
      answerHandlers({
        replay: {
          id: 'e0000000-0000-4000-8000-000000000002',
          feedback: { correction: { explanation: 'Exact.' }, explanation: 'Exact.' },
          response: { selfGrade: 'good' },
          is_correct: true,
          position: 1,
        },
      }),
    );
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      response: { selfRating: 'good' },
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        position: 0,
        skipped: false,
        isCorrect: true,
        correction: { explanation: 'Exact.' },
        explanation: 'Exact.',
        notions: [],
      },
    });
    expect(fake.calls.some((text) => text.startsWith('insert into public.answers'))).toBe(false);
  });

  it('CL-6 — une position déjà répondue avec un autre identifiant est un 409', async () => {
    const fake = fakeTx(answerHandlers({ conflict: true }));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 1200,
      response: { selfRating: 'good' },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', status: 409 } });
  });

  it('CL-6 — « Passer » écrit la réponse sans mise à jour FSRS', async () => {
    const fake = fakeTx(answerHandlers({}));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 800,
      skipped: true,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { position: 0, skipped: true, isCorrect: null, notions: [] },
    });
    expect(fake.calls.some((text) => text.startsWith('insert into public.answers'))).toBe(true);
    expect(fake.calls.some((text) => text.startsWith('insert into public.notion_states'))).toBe(
      false,
    );
  });

  it('ET-3, ET-4 — une carte de rappel met à jour le FSRS de sa notion', async () => {
    const fake = fakeTx(
      answerHandlers({
        state: {
          notion_id: NOTION_A,
          fsrs: {
            due: '2026-11-10T08:00:00.000Z',
            stability: 3.2,
            difficulty: 5.1,
            elapsed_days: 2,
            scheduled_days: 3,
            reps: 2,
            lapses: 0,
            state: 2,
            last_review: '2026-11-07T08:00:00.000Z',
          },
          due_at: '2026-11-10T08:00:00Z',
          mastery: '0.6',
          first_seen_at: '2026-11-01T08:00:00Z',
          last_seen_at: '2026-11-07T08:00:00Z',
          success_count: 2,
          gap_nature: null,
          gap_confused_with: null,
          gap_detected_at: null,
          gap_evidence: null,
          gap_cleared_at: null,
          in_review: true,
        },
      }),
    );
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 4200,
      response: { selfRating: 'good' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ position: 0, skipped: false, isCorrect: true });
    expect(result.value.notions).toHaveLength(1);
    expect(result.value.notions[0]).toMatchObject({ notionId: NOTION_A, rating: 'good' });
    expect(fake.calls.some((text) => text.startsWith('insert into public.notion_states'))).toBe(
      true,
    );
    expect(fake.calls.some((text) => text.includes('public.append_review_log'))).toBe(true);
  });

  it('ET-3 — une réponse hors schéma de jeu est refusée (422)', async () => {
    const fake = fakeTx(answerHandlers({}));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 4200,
      response: { selfRating: 'excellent' },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'RESPONSE_INVALID', status: 422 } });
  });

  it('ET-3 — une brique absente est une erreur interne', async () => {
    const fake = fakeTx(answerHandlers({ missingBrick: true }));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 4200,
      response: { selfRating: 'good' },
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('ET-3 — une configuration illisible est une erreur interne', async () => {
    const fake = fakeTx(answerHandlers({ config: null }));
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 4200,
      skipped: true,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('ET-3 — une association est corrigée par le moteur et sa réponse est conservée', async () => {
    const rights = opaqueMapping(matchingPayload, VERSION_A);
    const response = {
      pairs: Object.fromEntries(
        matchingPayload.pairs.map((pair) => [
          pair.id,
          rights.find((right) => right.pairId === pair.id)?.id ?? null,
        ]),
      ),
    };
    const fake = fakeTx(
      answerHandlers({
        brickType: 'matching',
        brickPayload: matchingPayload,
        notionIds: [NOTION_A],
      }),
    );
    const result = await answerReviewItem(context(fake), ACTIVITY, {
      position: 0,
      clientAnswerId: 'f0000000-0000-4000-8000-000000000001',
      timeMs: 9000,
      response,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ skipped: false, isCorrect: true });
  });

  function closureHandlers(options: {
    activity?: Record<string, unknown> | null;
    attempt?: Record<string, unknown> | null;
    config?: Record<string, unknown>;
    answers?: Record<string, unknown>[];
    positions?: number[];
    streak?: Record<string, unknown> | null;
    yesterday?: Record<string, unknown> | null;
    slot?: Record<string, unknown> | null;
  }): Handler[] {
    const config =
      options.config ??
      sessionConfig([
        {
          position: 0,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Le principe de la partie double',
          moduleIds: [MODULE_A],
          notionIds: [NOTION_A],
        },
        {
          position: 1,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Le cycle des ventes',
          moduleIds: [MODULE_B],
          notionIds: [NOTION_B],
        },
      ]);
    const activity =
      options.activity === undefined
        ? { id: ACTIVITY, owner_id: USER, config, items: [], formation_id: FORMATION }
        : options.activity;
    const attempt =
      options.attempt === undefined
        ? {
            id: ATTEMPT,
            attempt_no: 1,
            status: 'in_progress',
            started_at: '2026-11-11T12:00:00Z',
            review_feedback: null,
          }
        : options.attempt;
    return [
      (text) =>
        text.startsWith('select id::text as id, owner_id::text as owner_id') &&
        text.includes('for update')
          ? activity === null
            ? []
            : [activity]
          : undefined,
      (text) =>
        text.startsWith('select id::text as id, attempt_no, status::text as status')
          ? attempt === null
            ? []
            : [attempt]
          : undefined,
      (text) =>
        text.startsWith('select timezone from public.profiles')
          ? [{ timezone: 'Europe/Paris' }]
          : undefined,
      (text) => (text.startsWith('select a.config, a.items') ? [{ config, items: [] }] : undefined),
      (text) =>
        text.startsWith('select position from public.answers')
          ? (options.positions ?? []).map((position) => ({ position }))
          : undefined,
      (text) => (text.startsWith('insert into public.answers') ? [] : undefined),
      (text) =>
        text.startsWith('select id::text as id, position, is_correct')
          ? (options.answers ?? [])
          : undefined,
      (text) => (text.startsWith('update public.attempts') ? [] : undefined),
      (text) =>
        text.startsWith('select streak_days, streak_computed_on')
          ? options.streak === undefined || options.streak === null
            ? []
            : [options.streak]
          : undefined,
      (text) =>
        text.startsWith('select streak_days from public.profiles')
          ? options.streak === undefined || options.streak === null
            ? []
            : [{ streak_days: options.streak.streak_days }]
          : undefined,
      (text) =>
        text.includes('from public.daily_activity')
          ? options.yesterday === undefined || options.yesterday === null
            ? []
            : [options.yesterday]
          : undefined,
      (text) => (text.startsWith('update public.profiles') ? [] : undefined),
      (text) =>
        text.startsWith('select starts_at from public.schedule_slots')
          ? options.slot === undefined || options.slot === null
            ? []
            : [options.slot]
          : undefined,
    ];
  }

  function closureContext(fake: FakeTx): ServiceContext {
    const insertChain = {
      values: () => insertChain,
      onConflictDoUpdate: () => insertChain,
      returning: () =>
        Promise.resolve([
          {
            userId: USER,
            day: '2026-11-11',
            minutes: 1,
            qualifying: true,
            sources: ['review-session:x'],
          },
        ]),
    };
    const db = {
      run: (flow: (tx: unknown) => Promise<unknown>) =>
        flow({ ...(fake.tx as object), insert: () => insertChain }),
    };
    return { ...context(fake), db: db as never };
  }

  it('EF-11 — la clôture résume les jeux répondus et sautés, et qualifie la journée', async () => {
    const fake = fakeTx(
      closureHandlers({
        answers: [
          {
            id: 'e0000000-0000-4000-8000-000000000010',
            position: 1,
            is_correct: true,
            response: { selfGrade: 'good' },
            time_ms: 4200,
          },
          {
            id: 'e0000000-0000-4000-8000-000000000011',
            position: 2,
            is_correct: null,
            response: { skipped: true },
            time_ms: 0,
          },
        ],
        positions: [1],
        streak: { streak_days: 4, streak_computed_on: '2026-11-10' },
        yesterday: { qualifying: true },
        slot: { starts_at: '2026-11-12T17:00:00Z' },
      }),
    );
    const result = await completeReviewSession(closureContext(fake), ACTIVITY);
    expect(result).toMatchObject({
      ok: true,
      value: {
        reviewedCount: 2,
        okCount: 1,
        soonCount: 1,
        streakDays: 5,
        nextSessionAt: '2026-11-12T17:00:00.000Z',
      },
    });
    expect(result.ok && result.value.minutes).toBeGreaterThanOrEqual(1);
    expect(fake.calls.some((text) => text.startsWith('update public.attempts'))).toBe(true);
    expect(fake.calls.some((text) => text.startsWith('update public.profiles'))).toBe(true);
  });

  it('CL-12 — une session sans réponse ne qualifie pas la journée et garde la série', async () => {
    const fake = fakeTx(
      closureHandlers({
        config: sessionConfig([]),
        answers: [],
        streak: { streak_days: 3, streak_computed_on: '2026-11-10' },
        slot: null,
      }),
    );
    const result = await completeReviewSession(closureContext(fake), ACTIVITY);
    expect(result).toMatchObject({
      ok: true,
      value: { reviewedCount: 0, okCount: 0, soonCount: 0, streakDays: 3, nextSessionAt: null },
    });
    expect(fake.calls.some((text) => text.startsWith('update public.profiles'))).toBe(false);
  });

  it('EF-11 — une session déjà clôturée rejoue son résumé enregistré', async () => {
    const fake = fakeTx(
      closureHandlers({
        attempt: {
          id: ATTEMPT,
          attempt_no: 1,
          status: 'graded',
          started_at: '2026-11-11T12:00:00Z',
          review_feedback: {
            summary: {
              reviewedCount: 2,
              minutes: 3,
              okCount: 1,
              soonCount: 1,
              streakDays: 4,
              nextSessionAt: null,
            },
          },
        },
      }),
    );
    const result = await completeReviewSession(context(fake), ACTIVITY);
    expect(result).toMatchObject({
      ok: true,
      value: { reviewedCount: 2, minutes: 3, streakDays: 4 },
    });
  });

  it('CL-2 — une session clôturée sans résumé est un 422', async () => {
    const fake = fakeTx(
      closureHandlers({
        attempt: {
          id: ATTEMPT,
          attempt_no: 1,
          status: 'graded',
          started_at: '2026-11-11T12:00:00Z',
          review_feedback: null,
        },
      }),
    );
    const result = await completeReviewSession(context(fake), ACTIVITY);
    expect(result).toMatchObject({ ok: false, error: { code: 'SESSION_CLOSED', status: 422 } });
  });

  it('EF-10 — une session inconnue est un 404', async () => {
    const fake = fakeTx(closureHandlers({ activity: null }));
    const result = await completeReviewSession(context(fake), ACTIVITY);
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('EF-10 — une tentative absente est un 404', async () => {
    const fake = fakeTx(closureHandlers({ attempt: null }));
    const result = await completeReviewSession(context(fake), ACTIVITY);
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('ET-5 — une configuration illisible est une erreur interne', async () => {
    const fake = fakeTx(
      closureHandlers({
        activity: {
          id: ACTIVITY,
          owner_id: USER,
          config: { mode: 'full' },
          formation_id: FORMATION,
        },
      }),
    );
    const result = await completeReviewSession(context(fake), ACTIVITY);
    expect(result).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } });
  });

  it('EF-11 — une erreur et un jeu retiré comptent sans fausser le résumé', async () => {
    const config = {
      mode: 'full',
      forDate: '2026-11-11',
      dueCount: 3,
      deferredCount: 0,
      deferredTo: '2026-11-12',
      capMinutes: 45,
      estimatedSec: 180,
      rationale: [],
      items: [
        {
          position: 0,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Fausse',
          moduleIds: [MODULE_A],
          notionIds: [NOTION_A],
        },
        {
          position: 1,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Retirée',
          moduleIds: [MODULE_B],
          notionIds: [NOTION_B],
          withdrawn: true,
        },
        {
          position: 2,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Sans réponse',
          moduleIds: [MODULE_A],
          notionIds: ['99999999-9999-4999-8999-999999999999'],
        },
      ],
    };
    const fake = fakeTx(
      closureHandlers({
        config,
        answers: [
          {
            id: 'e0000000-0000-4000-8000-000000000020',
            position: 1,
            is_correct: false,
            response: {},
            time_ms: 1000,
          },
        ],
        positions: [1],
        streak: { streak_days: 0, streak_computed_on: null },
      }),
    );
    const result = await completeReviewSession(closureContext(fake), ACTIVITY);
    expect(result).toMatchObject({
      ok: true,
      value: { reviewedCount: 1, okCount: 0, soonCount: 1, streakDays: 1 },
    });
  });

  it('BR-GAM-01 — une journée déjà comptée n’étend pas la série deux fois', async () => {
    const fake = fakeTx(
      closureHandlers({
        answers: [
          {
            id: 'e0000000-0000-4000-8000-000000000021',
            position: 1,
            is_correct: true,
            response: { selfGrade: 'good' },
            time_ms: 3000,
          },
        ],
        positions: [1],
        streak: { streak_days: 7, streak_computed_on: '2026-11-11' },
      }),
    );
    const result = await completeReviewSession(closureContext(fake), ACTIVITY);
    expect(result).toMatchObject({ ok: true, value: { streakDays: 7 } });
  });

  it('BR-GAM-01 — un profil sans série repart de zéro', async () => {
    const fake = fakeTx(
      closureHandlers({
        answers: [
          {
            id: 'e0000000-0000-4000-8000-000000000022',
            position: 1,
            is_correct: true,
            response: { selfGrade: 'good' },
            time_ms: 3000,
          },
        ],
        positions: [1],
        streak: null,
      }),
    );
    const result = await completeReviewSession(closureContext(fake), ACTIVITY);
    expect(result).toMatchObject({ ok: true, value: { streakDays: 0 } });
  });
});
