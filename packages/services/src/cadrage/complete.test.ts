// Unit tests of the cadrage conclusion (SPEC-604 EF-10, ET-1; CA-5, CA-6). The transaction, the
// owner-role client and the outbox are fakes: these tests pin the completeness refusal, the
// deterministic event, the default objectives and the 409 idempotence, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { completeCadrage } from './complete';
import type { FormationRow, MessageRow } from './state';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    emit: vi.fn(),
    serviceExecute,
    serviceDb: vi.fn(() => ({ execute: serviceExecute })),
  };
});

vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

beforeEach(() => {
  mocks.emit.mockReset().mockResolvedValue(undefined);
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
});

function context(execute: ReturnType<typeof vi.fn>, userId = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-cadrage-complete',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function profile() {
  return {
    scope: { value: 'SAP', state: 'done' },
    starting_point: { value: null, state: 'todo' },
    target_level: { value: 'Certification', state: 'done' },
    volume: { value: null, state: 'todo' },
    dates: { value: null, state: 'todo' },
  };
}

function formation(partial: Partial<FormationRow> = {}): FormationRow {
  return {
    id: FORMATION,
    title: 'SAP S/4HANA Finance',
    status: 'cadrage',
    cadrage_profile: profile(),
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

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

describe('[SPEC-604] conclusion du cadrage', () => {
  it('enregistre les objectifs existants, le profil et l’événement stable (EF-10)', async () => {
    const execute = sequence([
      [formation({ objectives: ['exam'] })],
      [message({ question_key: null, content: 'Merci.' })],
      [],
    ]);

    const result = await completeCadrage(context(execute), FORMATION);

    expect(result).toEqual({ ok: true, value: { formationId: FORMATION } });
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'formation/cadrage-completed',
      { userId: USER, formationId: FORMATION },
      { id: `cadrage-completed:${FORMATION}` },
    );
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('applique l’objectif opérationnel par défaut (CA-5)', async () => {
    const execute = sequence([[formation()], [], []]);

    await expect(completeCadrage(context(execute), FORMATION)).resolves.toEqual({
      ok: true,
      value: { formationId: FORMATION },
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('refuse un second clic avec un 409 sans écrire (CA-6)', async () => {
    mocks.serviceExecute.mockResolvedValueOnce([{ present: true }]);
    const execute = vi.fn();

    await expect(completeCadrage(context(execute), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', status: 409 },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('refuse un cadrage incomplet, hors statut ou absent (CA-5, CL-6)', async () => {
    await expect(
      completeCadrage(
        context(
          sequence([
            [
              formation({
                cadrage_profile: { scope: { value: null, state: 'todo' } },
              }),
            ],
            [],
          ]),
        ),
        FORMATION,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CADRAGE_INCOMPLETE' } });

    await expect(
      completeCadrage(context(sequence([[formation({ status: 'active' })]])), FORMATION),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT', status: 409 } });

    await expect(completeCadrage(context(sequence([[]])), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('refuse un appel sans session', async () => {
    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-cadrage-complete',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(completeCadrage(anonymous, FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(mocks.serviceExecute).not.toHaveBeenCalled();
  });
});
