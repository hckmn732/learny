// Unit tests of the natural-language adjustment (SPEC-605 EF-3, ET-4). The transaction, the
// tutor, the outbox and the owner-role client are fakes: these tests pin the stored request, the
// new version and the failed-request trace, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';

import {
  CHANGE_REQUEST,
  FORMATION,
  USER,
  context,
  formationRow,
  profileRow,
  programmeDraft,
  proposalRow,
  sequence,
} from '../../test/support/programme';

import { adjustProposal } from './adjust';

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    run: vi.fn(),
    scenario: vi.fn(() => 'programme-adjust'),
    emit: vi.fn(),
    serviceExecute,
    serviceDb: vi.fn(() => ({ execute: serviceExecute })),
  };
});

vi.mock('@learny/tutor', () => ({
  programmeScenario: mocks.scenario,
  runProgrammeDraft: mocks.run,
}));

vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

const INPUT = { expectedVersion: 1, message: 'Ajoute un module sur les écritures.' };

beforeEach(() => {
  mocks.run.mockReset();
  mocks.scenario.mockClear();
  mocks.emit.mockReset().mockResolvedValue(undefined);
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
});

function generatedDraft() {
  return {
    ok: true as const,
    value: { draft: programmeDraft(), attempts: 1, promptId: 'programme', promptVersion: 1 },
  };
}

describe('[SPEC-605] ajustement du programme', () => {
  it('EF-3 — enregistre la demande, crée une version 2 et garde la version 1', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [{ version: 1 }],
      [proposalRow({ version: 1 })],
      [{ id: CHANGE_REQUEST }],
      [profileRow()],
      [],
      [formationRow({ status: 'programme_proposed' })],
      [{ version: 1 }],
      [],
      [],
      [],
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 2 }), proposalRow({ version: 1 })],
      [{ count: 0 }],
    ]);
    mocks.run.mockResolvedValue(generatedDraft());

    const result = await adjustProposal(context(execute), FORMATION, INPUT);
    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        proposal: { version: 2, proposalStatus: 'proposed' },
      },
    });
    expect(execute).toHaveBeenCalledTimes(14);

    const call = mocks.run.mock.calls[0] as
      [Record<string, unknown>, { documents: { source: string }[] }] | undefined;
    if (call === undefined) throw new Error('runProgrammeDraft non appelé');
    const [scope, state] = call;
    expect(scope).toMatchObject({
      userId: USER,
      formationId: FORMATION,
      scenario: 'programme-adjust',
    });
    expect(state).toMatchObject({
      title: 'SAP S/4HANA Finance',
      message: INPUT.message,
      context: JSON.stringify({ versionActuelle: 1 }),
    });
    expect(state.documents[0]?.source).toBe('proposition-actuelle');
    expect(mocks.scenario).toHaveBeenCalledWith('adjust', 'SAP S/4HANA Finance', INPUT.message);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'formation/programme-requested',
      { userId: USER, formationId: FORMATION, changeRequestId: CHANGE_REQUEST },
      { id: `programme-requested:${CHANGE_REQUEST}` },
    );
  });

  it('marque la demande en échec quand le tuteur ne répond pas', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [{ version: 1 }],
      [proposalRow({ version: 1 })],
      [{ id: CHANGE_REQUEST }],
      [profileRow()],
      [],
    ]);
    mocks.run.mockResolvedValue({
      ok: false,
      error: new AppError('AI_TASK_FAILED', 'Sortie invalide.'),
    });

    const result = await adjustProposal(context(execute), FORMATION, INPUT);
    expect(result).toMatchObject({ ok: false, error: { code: 'AI_TASK_FAILED' } });
    // Five preparation reads plus the failed-status update; no proposal is written.
    expect(execute).toHaveBeenCalledTimes(6);
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('refuse un appelant anonyme et une formation absente', async () => {
    const anonymous = await adjustProposal(context(sequence([]), null), FORMATION, INPUT);
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const missing = await adjustProposal(context(sequence([[]])), FORMATION, INPUT);
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une formation sans proposition ajustable', async () => {
    const result = await adjustProposal(
      context(sequence([[formationRow({ status: 'cadrage' })]])),
      FORMATION,
      INPUT,
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Aucune proposition ajustable pour cette formation.',
      },
    });
  });

  it('refuse une version périmée ou une proposition introuvable', async () => {
    const stale = await adjustProposal(
      context(sequence([[formationRow({ status: 'programme_proposed' })], [{ version: 2 }]])),
      FORMATION,
      INPUT,
    );
    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'La proposition a changé : rechargez la version actuelle.',
      },
    });

    const missing = await adjustProposal(
      context(sequence([[formationRow({ status: 'programme_proposed' })], [{ version: 1 }], []])),
      FORMATION,
      INPUT,
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une demande d’ajustement non enregistrée', async () => {
    const result = await adjustProposal(
      context(
        sequence([
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1 })],
          [],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'La demande d’ajustement n’a pas pu être créée.',
      },
    });
  });

  it('re-vérifie la formation et la version sous le verrou', async () => {
    mocks.run.mockResolvedValue(generatedDraft());
    const missing = await adjustProposal(
      context(
        sequence([
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1 })],
          [{ id: CHANGE_REQUEST }],
          [profileRow()],
          [],
          [],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const stale = await adjustProposal(
      context(
        sequence([
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1 })],
          [{ id: CHANGE_REQUEST }],
          [profileRow()],
          [],
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 2 }],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
});
