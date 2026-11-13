// Unit tests of the SPEC-611 quiz guards and open-answer grading. The transaction is a fake and
// the LLM session is mocked: these tests pin the module lock, the prompt id and the bounded schema.

import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { defaultOpenAnswerGrader, promptIdOf } from './grade-open';
import { moduleOpenGuard } from './guards';
import { requestQuizRegeneration } from './regeneration';

const USER = '11111111-1111-4111-8111-111111111111';
const MODULE = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-11T12:20:00Z');

const session = vi.hoisted(() => vi.fn());
vi.mock('@learny/llm', () => ({ llm: { session } }));

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-quiz',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

const payload = {
  stem: 'Pourquoi une écriture est-elle équilibrée ?',
  expectedElements: ['La partie double', 'Débit = crédit'],
  criteria: [{ key: 'principe', label: 'Principe', points: 10, description: '' }],
  answerMaxChars: 1500,
  modelAnswer: 'Chaque flux est enregistré deux fois.',
  explanation: 'La partie double garantit l’équilibre.',
  objective: 'Justifier la partie double',
  sources: [],
};

const input = {
  brickVersionId: '33333333-3333-4333-8333-333333333333',
  notionLabel: 'Partie double',
  type: 'open_question' as const,
  payload,
  response: 'Parce que chaque débit a un crédit équivalent.',
};

function llmResult(value: unknown) {
  return {
    ok: true,
    value: { object: () => Promise.resolve({ ok: true, value }) },
  };
}

describe('[SPEC-611] quiz — gardes et correction ouverte', () => {
  it('refuse un appelant anonyme et un module introuvable ou verrouillé (BR-FOR-08)', async () => {
    await expect(
      moduleOpenGuard({ ...context(vi.fn()), userId: null, db: null }, MODULE),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    await expect(
      moduleOpenGuard(context(vi.fn().mockResolvedValue([])), MODULE),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const locked = vi.fn().mockResolvedValue([{ status: 'locked' }]);
    await expect(moduleOpenGuard(context(locked), MODULE)).resolves.toMatchObject({
      ok: false,
      error: { code: 'MODULE_LOCKED' },
    });
  });

  it('ouvre un module ouvert ou validé (ET-6)', async () => {
    const open = vi.fn().mockResolvedValue([{ status: 'open' }]);
    await expect(moduleOpenGuard(context(open), MODULE)).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    const validated = vi.fn().mockResolvedValue([{ status: 'validated' }]);
    await expect(moduleOpenGuard(context(validated), MODULE)).resolves.toMatchObject({ ok: true });
  });

  it('construit un prompt borné et valide la note structurée (ET-8)', async () => {
    session.mockResolvedValueOnce(
      llmResult({
        score: 0.75,
        explanation: 'La partie double est comprise.',
        criteria: [{ key: 'principe', ok: true, comment: 'Correct.' }],
        missing: ['La traçabilité des flux'],
        offTopic: false,
      }),
    );

    const result = await defaultOpenAnswerGrader(
      {
        userId: USER,
        formationId: '44444444-4444-4444-8444-444444444444',
        requestId: 'req-grade',
        llmDb: {} as never,
        scenario: 'grade-open-good',
      },
      input,
    );

    expect(result).toMatchObject({ ok: true, value: { score: 0.75, offTopic: false } });
    const call = session.mock.calls.at(-1);
    expect(call?.[1]).toMatchObject({
      promptId: 'tutor.grade-open',
      mock: { scenario: 'grade-open-good' },
    });
    expect(promptIdOf()).toBe('tutor.grade-open.1');
  });

  it('ne demande aucune régénération sans cours prêt ou sans notion (EF-8)', async () => {
    const noCourse = { execute: vi.fn().mockResolvedValue([]) };
    await expect(
      requestQuizRegeneration(
        noCourse as never,
        context(vi.fn()),
        USER,
        '44444444-4444-4444-8444-444444444444',
        ['55555555-5555-4555-8555-555555555555'],
      ),
    ).resolves.toEqual([]);

    const course = {
      execute: vi.fn().mockResolvedValue([{ id: '66666666-6666-4666-8666-666666666666' }]),
    };
    await expect(
      requestQuizRegeneration(
        course as never,
        context(vi.fn()),
        USER,
        '44444444-4444-4444-8444-444444444444',
        [],
      ),
    ).resolves.toEqual([]);
  });

  it('propage un échec de session ou de génération (ET-8)', async () => {
    session.mockResolvedValueOnce({
      ok: false,
      error: { code: 'AI_UNAVAILABLE', detail: 'indisponible' },
    });
    await expect(
      defaultOpenAnswerGrader(
        {
          userId: USER,
          formationId: '44444444-4444-4444-8444-444444444444',
          requestId: 'req',
          llmDb: {} as never,
        },
        input,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'AI_UNAVAILABLE' } });

    session.mockResolvedValueOnce({
      ok: true,
      value: { object: () => Promise.resolve({ ok: false, error: { code: 'AI_UNAVAILABLE' } }) },
    });
    await expect(
      defaultOpenAnswerGrader(
        {
          userId: USER,
          formationId: '44444444-4444-4444-8444-444444444444',
          requestId: 'req',
          llmDb: {} as never,
        },
        input,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'AI_UNAVAILABLE' } });
  });

  it('refuse une sortie de correction invalide (ET-8)', async () => {
    session.mockResolvedValueOnce(llmResult({ score: 2, explanation: '' }));

    await expect(
      defaultOpenAnswerGrader(
        {
          userId: USER,
          formationId: '44444444-4444-4444-8444-444444444444',
          requestId: 'req',
          llmDb: {} as never,
        },
        input,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'INVALID_OUTPUT' } });
  });
});
