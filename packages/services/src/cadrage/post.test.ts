// Unit tests of one learner answer and its tutor turn (SPEC-604 EF-5 to EF-9, ET-2; CL-1, CL-6,
// CL-7). The transaction, the owner-role client and the tutor are fakes: these tests pin the
// two-transaction order, the retry, the selection validation and every business refusal, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { postCadrageMessage } from './post';
import type { FormationRow, MessageRow } from './state';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    run: vi.fn(),
    scenario: vi.fn(() => 'scenario-test'),
    serviceExecute,
    serviceDb: vi.fn(() => ({ execute: serviceExecute })),
  };
});

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
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
});

function context(
  execute: ReturnType<typeof vi.fn>,
  profileRows: unknown[] = [{ tone: 'tu', courseLanguage: 'fr' }],
  userId = USER,
): ServiceContext {
  const select = vi.fn(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve(profileRows) }) }),
  }));
  return {
    userId,
    requestId: 'req-cadrage-post',
    db: {
      run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute, select }),
    } as unknown as UserDatabase,
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

function applied(partial: Record<string, unknown> = {}) {
  return {
    profile: {
      scope: { value: 'SAP', state: 'done' },
      starting_point: { value: null, state: 'todo' },
      target_level: { value: null, state: 'todo' },
      volume: { value: null, state: 'todo' },
      dates: { value: null, state: 'todo' },
    },
    objectives: ['operational'],
    questionsAsked: 1,
    finished: false,
    questionNumber: 2,
    questionKey: 'starting_point',
    multi: false,
    suggestions: null,
    content: 'Où en êtes-vous ?',
    ...partial,
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function questionSuggestion() {
  return {
    label: 'Oui, utilisateur autonome',
    value: 'autonome',
    multi: false,
  };
}

function happySequence(before: MessageRow[] = [message({ suggestions: [questionSuggestion()] })]) {
  return sequence([
    [formation()],
    before,
    [{ next: 2 }],
    [],
    [formation()],
    [],
    [{ next: 3 }],
    [{ id: MESSAGE }],
    [formation()],
    [message({ id: MESSAGE, content: 'Réponse enregistrée.', question_key: 'starting_point' })],
  ]);
}

describe('[SPEC-604] message du cadrage', () => {
  it('enregistre la réponse puis le tour validé du tuteur (EF-5, ET-2)', async () => {
    const execute = happySequence();
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    const result = await postCadrageMessage(context(execute), FORMATION, {
      selections: ['autonome'],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        questionsAsked: 1,
        pendingQuestion: { questionKey: 'starting_point' },
        error: null,
      },
    });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ formationId: FORMATION, scenario: 'scenario-test' }),
      expect.objectContaining({
        learnerMessage: 'Oui, utilisateur autonome',
        questionsAsked: 1,
        finished: false,
        pendingQuestionKey: 'scope',
      }),
    );
  });

  it('réessaie un tour interrompu en conservant la réponse du dernier message (CL-1)', async () => {
    const interrupt = message({
      id: '00000000-0000-4000-8000-000000000002',
      role: 'learner',
      content: 'Je connais la comptabilité.',
      question_key: null,
    });
    const execute = sequence([
      [formation()],
      [message(), interrupt],
      [formation()],
      [],
      [{ next: 3 }],
      [{ id: MESSAGE }],
      [formation()],
      [message({ id: MESSAGE, content: 'Tour récupéré.' })],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    const result = await postCadrageMessage(context(execute), FORMATION, { retry: true });

    expect(result).toMatchObject({ ok: true, value: { formationId: FORMATION } });
    expect(mocks.run).toHaveBeenCalledWith(
      expect.objectContaining({ scenario: 'scenario-test' }),
      expect.objectContaining({
        learnerMessage: 'Je connais la comptabilité.',
        pendingQuestionKey: 'scope',
        questionsAsked: 1,
      }),
    );
  });

  it('réessaie sans historique quand aucune réponse n’a encore été envoyée (CL-1)', async () => {
    const execute = sequence([
      [formation()],
      [],
      [formation()],
      [],
      [{ next: 2 }],
      [{ id: MESSAGE }],
      [formation()],
      [message({ id: MESSAGE, content: 'Nouveau départ.' })],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    const result = await postCadrageMessage(context(execute), FORMATION, { retry: true });

    expect(result.ok).toBe(true);
    expect(mocks.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ learnerMessage: '', questionsAsked: 0 }),
    );
  });

  it('refuse un cadrage déjà conclu ou hors statut (CL-6)', async () => {
    mocks.serviceExecute.mockResolvedValueOnce([{ present: true }]);
    await expect(
      postCadrageMessage(context(sequence([])), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    await expect(
      postCadrageMessage(context(sequence([[formation({ status: 'active' })]])), FORMATION, {
        content: 'SAP',
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    await expect(
      postCadrageMessage(context(sequence([[]])), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une réponse alors que le tuteur n’a pas encore parlé (CL-6)', async () => {
    const execute = sequence([
      [formation()],
      [
        message(),
        message({
          id: '00000000-0000-4000-8000-000000000002',
          role: 'learner',
          question_key: null,
        }),
      ],
    ]);

    await expect(
      postCadrageMessage(context(execute), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', detail: 'Le tuteur n’a pas encore répondu à votre message.' },
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('refuse un retry quand le dernier message est déjà celui du tuteur (CL-1)', async () => {
    const execute = sequence([[formation()], [message()]]);

    await expect(
      postCadrageMessage(context(execute), FORMATION, { retry: true }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', detail: 'Aucune réponse du tuteur à réessayer.' },
    });
  });

  it('refuse une sélection inconnue ou périmée (CL-7)', async () => {
    await expect(
      postCadrageMessage(
        context(sequence([[formation()], [message({ suggestions: [questionSuggestion()] })]])),
        FORMATION,
        { selections: ['inconnue'] },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED', detail: 'Cette question a déjà reçu une réponse.' },
    });

    await expect(
      postCadrageMessage(
        context(sequence([[formation()], [message({ question_key: null })]])),
        FORMATION,
        { selections: ['autonome'] },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('refuse un profil absent et une entrée invalide', async () => {
    await expect(
      postCadrageMessage(context(sequence([[formation()], []]), []), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    await expect(postCadrageMessage(context(sequence([])), FORMATION, {})).rejects.toThrow();
    await expect(
      postCadrageMessage(context(sequence([])), FORMATION, {
        content: 'SAP',
        selections: ['autonome'],
      }),
    ).rejects.toThrow();
  });

  it('renvoie une erreur métier du tuteur sans écrire le tour (CL-4)', async () => {
    const execute = sequence([[formation()], [message()], [{ next: 2 }], []]);
    mocks.run.mockResolvedValue({
      ok: false,
      error: new AppError('AI_TASK_FAILED', 'Le tuteur n’a pas pu répondre.'),
    });

    await expect(
      postCadrageMessage(context(execute), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'AI_TASK_FAILED' } });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('refuse une formation disparue entre les deux transactions', async () => {
    const failing = sequence([[formation()], [message()], [{ next: 2 }], [], []]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    await expect(
      postCadrageMessage(context(failing), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une formation sortie du cadrage avant la persistance', async () => {
    const execute = sequence([
      [formation()],
      [message()],
      [{ next: 2 }],
      [],
      [formation({ status: 'active' })],
    ]);
    mocks.run.mockResolvedValue({ ok: true, value: { applied: applied() } });

    await expect(
      postCadrageMessage(context(execute), FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('refuse un appel sans session', async () => {
    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-cadrage-post',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(
      postCadrageMessage(anonymous, FORMATION, { content: 'SAP' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});
