// Unit tests of the result read model of SPEC-612 (EF-1 to EF-5, ET-1, BR-QUI-05, BR-LAC-04). The
// transaction is a fake routed by SQL text; the retry gate is mocked. These tests pin the verdict,
// the points missing, the gap/mastered split, the history and the remediation block.

import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getQuizResult } from './result';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const N1 = '55555555-5555-4555-8555-555555555555';
const N2 = '66666666-6666-4666-8666-666666666666';
const N3 = '77777777-7777-4777-8777-777777777777';
const N4 = '88888888-8888-4888-8888-888888888888';
const V1 = '99999999-9999-4999-8999-999999999999';
const V2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const V3 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = new Date('2026-11-11T12:20:00Z');

const readRetryGate = vi.hoisted(() => vi.fn());
vi.mock('./retry-gate', () => ({ readRetryGate }));

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
  attempt?: unknown[];
  answers?: unknown[];
  notions?: unknown[];
  history?: unknown[];
  next?: unknown[];
  latestFailed?: unknown[];
  remediation?: unknown[];
}

function executeOf(rows: Rows) {
  return vi.fn((query: unknown): Promise<unknown[]> => {
    const text = textOf(query);
    if (text.includes('join public.modules m on m.id = act.module_id')) {
      return Promise.resolve(rows.attempt ?? []);
    }
    if (text.includes('from public.answers where attempt_id'))
      return Promise.resolve(rows.answers ?? []);
    if (text.includes('from public.notions n')) return Promise.resolve(rows.notions ?? []);
    if (text.includes('select at.attempt_no, at.score::text as score, at.passed')) {
      return Promise.resolve(rows.history ?? []);
    }
    if (text.includes('select id::text as id, position::int as position, title')) {
      return Promise.resolve(rows.next ?? []);
    }
    if (text.includes('at.passed = false')) return Promise.resolve(rows.latestFailed ?? []);
    if (text.includes("(act.config ->> 'sourceAttemptId')")) {
      return Promise.resolve(rows.remediation ?? []);
    }
    throw new Error(`Requête non routée : ${text}`);
  });
}

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-result',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

const attemptRow = {
  id: ATTEMPT,
  attempt_no: 2,
  status: 'graded',
  started_at: '2026-11-11T12:00:00.000Z',
  submitted_at: '2026-11-11T12:20:00.000Z',
  score: '68.5',
  passed: false,
  per_notion: {
    [N1]: { correct: 1, total: 2, score: 50 },
    'not-a-uuid': { correct: 1, total: 1, score: 100 },
    [N2]: 'invalid',
  },
  items: [{ notionId: N1 }, { notionId: N2 }, 'invalid', { notionId: N4 }],
  module_id: MODULE,
  formation_id: FORMATION,
  position: 2,
  module_title: 'Module 2',
  threshold: 80,
};

const answers = [
  { position: 1, brick_version_id: V1, is_correct: true, score: '100', max_score: '100' },
  { position: 2, brick_version_id: V2, is_correct: false, score: '0', max_score: '100' },
  { position: 3, brick_version_id: V3, is_correct: null, score: null, max_score: '100' },
];

const notions = [
  {
    id: N1,
    label: 'Partie double',
    position: 1,
    mastery: '40',
    gap_nature: 'confusion',
    gap_evidence: 'Confondue avec le débit.',
    gap_confused_with: N2,
  },
  {
    id: N2,
    label: 'Débit',
    position: 2,
    mastery: '85',
    gap_nature: null,
    gap_evidence: null,
    gap_confused_with: null,
  },
  {
    id: N3,
    label: 'Crédit',
    position: 3,
    mastery: '80',
    gap_nature: null,
    gap_evidence: null,
    gap_confused_with: null,
  },
  {
    id: N4,
    label: 'Bilan',
    position: 4,
    mastery: '10',
    gap_nature: 'application',
    gap_evidence: null,
    gap_confused_with: null,
  },
];

function hygiene() {
  readRetryGate.mockResolvedValue({ allowed: true, availableAt: null, reason: null });
}

describe('[SPEC-612] résultat de quiz', () => {
  it('refuse un identifiant invalide et une tentative introuvable (CL-5)', async () => {
    hygiene();
    await expect(getQuizResult(context(executeOf({})), 'not-a-uuid')).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
    await expect(getQuizResult(context(executeOf({})), ATTEMPT)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('rend le verdict d’une tentative échouée avec ses lacunes bornées (CA-1, CL-11)', async () => {
    hygiene();
    const result = await getQuizResult(
      context(
        executeOf({
          attempt: [attemptRow],
          answers,
          notions,
          history: [
            { attempt_no: 1, score: '50.0', passed: false },
            { attempt_no: 2, score: null, passed: null },
          ],
          next: [],
          remediation: [],
        }),
      ),
      ATTEMPT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      attemptId: ATTEMPT,
      attemptNo: 2,
      status: 'graded',
      score: 68.5,
      provisionalScore: 68.5,
      threshold: 80,
      passed: false,
      pointsMissing: 12,
      isLastModule: true,
      nextModule: null,
      pendingOpenCount: 1,
      remediation: { status: 'none', href: null },
      retry: { allowed: true, availableAt: null, reason: null },
    });
    expect(result.value.history).toEqual([{ attemptNo: 1, score: 50, passed: false }]);
    expect(result.value.gaps.map((gap) => gap.notionId)).toEqual([N4, N1]);
    expect(result.value.gaps[0]?.evidence).toContain('l’exercice');
    expect(result.value.gaps[1]).toMatchObject({
      nature: 'confusion',
      natureLabel: 'Confusion',
      evidence: 'Confondue avec le débit.',
      proposal: 'une question qui oppose les deux notions.',
    });
    expect(result.value.mastered.map((notion) => notion.notionId)).toEqual([N2, N3]);
    expect(result.value.perNotion).toEqual([
      { notionId: N1, label: 'Partie double', correct: 1, total: 2, score: 50 },
    ]);
  });

  it('rend un score provisoire, toutes les lacunes au-delà du seuil et la remédiation (CA-2, CA-6)', async () => {
    hygiene();
    readRetryGate.mockResolvedValue({
      allowed: false,
      availableAt: '2026-11-12T12:20:00.000Z',
      reason: 'delay',
    });
    const inProgress = {
      ...attemptRow,
      status: 'in_progress',
      score: null,
      passed: null,
      attempt_no: 3,
    };

    const result = await getQuizResult(
      context(
        executeOf({
          attempt: [inProgress],
          answers,
          notions,
          history: [],
          next: [{ id: MODULE, position: 3, title: 'Module 3' }],
          latestFailed: [{ attempt_id: ATTEMPT }],
          remediation: [
            {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              status: 'ready',
              attempt_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              attempt_status: 'in_progress',
              checked: 1,
              preparing: false,
            },
          ],
        }),
      ),
      ATTEMPT,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      status: 'in_progress',
      score: null,
      provisionalScore: 50,
      passed: null,
      pointsMissing: null,
      isLastModule: false,
      nextModule: { id: MODULE, position: 3, title: 'Module 3' },
      remediation: {
        status: 'in_progress',
        href: `/formations/${FORMATION}/modules/${MODULE}/remediation`,
      },
      retry: { allowed: false, reason: 'delay' },
    });
  });

  it('rend toutes les lacunes d’une tentative réussie et les états de remédiation (CA-6)', async () => {
    hygiene();
    const passed = {
      ...attemptRow,
      score: '90',
      passed: true,
    };

    const allGaps = await getQuizResult(
      context(
        executeOf({
          attempt: [passed],
          answers,
          notions,
          history: [],
          next: [],
          remediation: [],
        }),
      ),
      ATTEMPT,
    ).then((result) => (result.ok ? result.value : null));
    expect(allGaps?.gaps.map((gap) => gap.notionId)).toEqual([N4, N1]);
    expect(allGaps?.pointsMissing).toBeNull();
    expect(allGaps?.remediation).toEqual({ status: 'none', href: null });

    for (const [row, status] of [
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'draft',
          attempt_id: null,
          attempt_status: null,
          checked: 0,
          preparing: false,
        },
        'preparing',
      ],
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'draft',
          attempt_id: null,
          attempt_status: null,
          checked: 0,
          preparing: true,
        },
        'preparing',
      ],
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'archived',
          attempt_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          attempt_status: 'graded',
          checked: 2,
          preparing: false,
        },
        'completed',
      ],
      [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          status: 'ready',
          attempt_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          attempt_status: 'in_progress',
          checked: 0,
          preparing: false,
        },
        'ready',
      ],
    ] as const) {
      const result = await getQuizResult(
        context(
          executeOf({
            attempt: [attemptRow],
            answers,
            notions,
            history: [],
            next: [],
            remediation: [row],
          }),
        ),
        ATTEMPT,
      );
      expect(result).toMatchObject({
        ok: true,
        value: {
          remediation: {
            status,
            href: `/formations/${FORMATION}/modules/${MODULE}/remediation`,
          },
        },
      });
    }
  });

  it('ne garde que les six dernières tentatives corrigées (CA-2)', async () => {
    hygiene();
    const history = Array.from({ length: 8 }, (_, index) => ({
      attempt_no: index + 1,
      score: String((index + 1) * 10),
      passed: index > 4,
    }));
    const result = await getQuizResult(
      context(
        executeOf({
          attempt: [attemptRow],
          answers,
          notions: [],
          history,
          next: [],
          remediation: [],
        }),
      ),
      ATTEMPT,
    );
    expect(result.ok && result.value.history).toHaveLength(6);
    expect(result.ok && result.value.history[0]?.attemptNo).toBe(3);
  });
});
