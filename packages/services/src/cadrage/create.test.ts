// Unit tests of formation creation and its first cadrage turn (SPEC-604 EF-4, ET-1; BR-FOR-01,
// BR-FOR-03, CL-2, CL-12). The transaction, the owner-role client and the tutor are fakes: these
// tests pin the committed-then-called order, the resumable AI failure and the RLS refusal, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { createFormation } from './create';
import type { FormationRow, MessageRow } from './state';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  scenario: vi.fn(() => 'scenario-test'),
  serviceDb: vi.fn(() => ({ execute: vi.fn() })),
}));

vi.mock('@learny/tutor', () => ({
  cadrageScenario: mocks.scenario,
  runCadrageTurn: mocks.run,
}));

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

beforeEach(() => {
  mocks.run.mockReset();
  mocks.scenario.mockClear();
  mocks.serviceDb.mockClear();
});

function context(execute: ReturnType<typeof vi.fn>, userId = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-cadrage-create',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function formation(partial: Partial<FormationRow> = {}): FormationRow {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    status: 'cadrage',
    cadrage_profile: {},
    objectives: [],
    course_language: 'fr',
    ...partial,
  };
}

function message(partial: Partial<MessageRow> = {}): MessageRow {
  return {
    id: MESSAGE,
    role: 'tutor',
    content: 'Quel est le périmètre ?',
    question_key: 'scope',
    suggestions: null,
    position: 1,
    created_at: NOW.toISOString(),
    ...partial,
  };
}

function applied() {
  return {
    profile: {
      scope: { value: 'SAP', state: 'waiting' },
      starting_point: { value: null, state: 'todo' },
      target_level: { value: null, state: 'todo' },
      volume: { value: null, state: 'todo' },
      dates: { value: null, state: 'todo' },
    },
    objectives: ['operational'],
    questionsAsked: 1,
    finished: false,
    questionNumber: 1,
    questionKey: 'scope',
    multi: false,
    suggestions: null,
    content: 'Quel est le périmètre ?',
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function createdRows(accent = 'indigo'): unknown[][] {
  return [[{ tone: 'tu', course_language: 'fr' }], [{ accent_color: accent }], [formation()]];
}

describe('[SPEC-604] création d’une formation', () => {
  it('crée la formation, appelle le tuteur puis persiste le premier tour (EF-4)', async () => {
    const execute = sequence([
      ...createdRows(),
      [formation()],
      [],
      [{ next: 2 }],
      [{ id: MESSAGE }],
      [formation()],
      [message()],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    const result = await createFormation(context(execute), { title: 'SAP S/4HANA Finance' });

    expect(result).toMatchObject({
      ok: true,
      value: {
        formation: { id: FORMATION, title: 'SAP S/4HANA Finance', status: 'cadrage' },
        cadrage: {
          formationId: FORMATION,
          messages: [{ id: MESSAGE, questionNumber: 1 }],
          questionsAsked: 1,
          error: null,
        },
      },
    });
    expect(mocks.serviceDb).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER,
        formationId: FORMATION,
        requestId: 'req-cadrage-create',
        scenario: 'scenario-test',
      }),
      expect.objectContaining({ title: 'SAP S/4HANA Finance', learnerMessage: '' }),
    );
  });

  it('choisit la première couleur libre puis retombe sur indigo (ADR-0162)', async () => {
    const used = sequence([
      [{ tone: 'vous', course_language: 'en' }],
      [{ accent_color: 'indigo' }, { accent_color: 'green' }],
      [formation()],
      [formation()],
      [],
      [{ next: 2 }],
      [{ id: MESSAGE }],
      [formation()],
      [],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    await createFormation(context(used), { title: 'SAP' });
    expect(mocks.run).toHaveBeenCalledTimes(1);

    const exhausted = sequence([
      [{ tone: 'tu', course_language: 'fr' }],
      [],
      [formation()],
      [formation()],
      [],
      [{ next: 2 }],
      [{ id: MESSAGE }],
      [],
      [],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    const result = await createFormation(context(exhausted), { title: 'SAP' });
    expect(result.ok).toBe(true);
  });

  it('laisse la formation reprenable quand le tuteur échoue (CL-2)', async () => {
    const execute = sequence(createdRows());
    mocks.run.mockResolvedValue({
      ok: false,
      error: new AppError('AI_UNAVAILABLE', 'Aucun modèle disponible.'),
    });

    const result = await createFormation(context(execute), { title: 'Sans abonnement' });

    expect(result).toMatchObject({
      ok: true,
      value: {
        formation: { id: FORMATION, status: 'cadrage' },
        cadrage: {
          messages: [],
          error: { code: 'AI_UNAVAILABLE' },
        },
      },
    });
    if (!result.ok) throw new Error('formation attendue');
    expect(result.value.cadrage.error?.message).toContain('Aucun modèle');
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('traduit un échec inconnu du tuteur en message générique', async () => {
    const execute = sequence(createdRows());
    mocks.run.mockResolvedValue({
      ok: false,
      error: new AppError('UNKNOWN_AI_ERROR', 'Échec.'),
    });

    const result = await createFormation(context(execute), { title: 'Sans abonnement' });

    expect(result).toMatchObject({
      ok: true,
      value: {
        cadrage: { error: { code: 'UNKNOWN_AI_ERROR', message: 'Le tuteur n’a pas pu répondre.' } },
      },
    });
  });

  it('refuse un profil absent, une entrée invalide et un appel anonyme', async () => {
    await expect(createFormation(context(sequence([[]])), { title: 'SAP' })).resolves.toMatchObject(
      { ok: false, error: { code: 'NOT_FOUND' } },
    );

    await expect(createFormation(context(sequence([])), {})).rejects.toThrow();
    await expect(createFormation(context(sequence([])), { title: '   ' })).rejects.toThrow();

    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-cadrage-create',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(createFormation(anonymous, { title: 'SAP' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('refuse une formation disparue entre les deux transactions', async () => {
    const execute = sequence([...createdRows(), []]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    await expect(createFormation(context(execute), { title: 'SAP' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('reste lisible quand la relecture finale ne trouve plus la formation', async () => {
    const execute = sequence([
      ...createdRows(),
      [formation()],
      [],
      [{ next: 2 }],
      [{ id: MESSAGE }],
      [],
      [message()],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    const result = await createFormation(context(execute), { title: 'SAP' });
    expect(result).toMatchObject({ ok: true, value: { cadrage: { messages: [{ id: MESSAGE }] } } });
  });
});
