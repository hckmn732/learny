// Unit tests of the programme import (SPEC-605 EF-2, CL-5). The transaction, the tutor, the
// outbox and the owner-role client are fakes: these tests pin the stored private import, the
// retryable failure and the imported version, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';

import {
  FORMATION,
  IMPORT,
  USER,
  context,
  formationRow,
  profileRow,
  programmeDraft,
  proposalRow,
  sequence,
} from '../../test/support/programme';

import { importProposal } from './import';

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    run: vi.fn(),
    scenario: vi.fn(() => 'programme-import'),
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

const TEXT_INPUT = {
  kind: 'text' as const,
  expectedVersion: 0,
  text: 'Module 1 : Comptabilité\nChapitre 1 : Bilan\nNotion : Actif',
};

type RunCall = [Record<string, unknown>, { documents: { source: string; text: string }[] }];

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

describe('[SPEC-605] import du programme', () => {
  it('EF-2 — structure un texte collé et crée la proposition importée', async () => {
    const execute = sequence([
      [formationRow({ status: 'cadrage' })],
      [{ version: 0 }],
      [{ id: IMPORT }],
      [profileRow()],
      [],
      [formationRow({ status: 'cadrage' })],
      [{ version: 0 }],
      [],
      [],
      [],
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 1, source: 'imported', import_id: IMPORT })],
      [{ count: 0 }],
    ]);
    mocks.run.mockResolvedValue(generatedDraft());

    const result = await importProposal(context(execute), FORMATION, TEXT_INPUT);
    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        proposal: { version: 1, source: 'imported' },
      },
    });
    expect(execute).toHaveBeenCalledTimes(13);

    const call = mocks.run.mock.calls[0] as RunCall | undefined;
    if (call === undefined) throw new Error('runProgrammeDraft non appelé');
    const [scope, state] = call;
    expect(scope).toMatchObject({
      userId: USER,
      formationId: FORMATION,
      scenario: 'programme-import',
    });
    expect(state.documents[0]).toMatchObject({
      source: 'programme-collé',
      title: 'Programme importé par l’apprenant',
    });
    expect(state.documents[0]?.text).toContain('Chapitre 1 : Bilan');
    expect(mocks.scenario).toHaveBeenCalledWith(
      'import',
      'SAP S/4HANA Finance',
      expect.stringContaining('Chapitre 1 : Bilan'),
    );
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'formation/programme-imported',
      { userId: USER, formationId: FORMATION, importId: IMPORT },
      { id: `programme-imported:${IMPORT}` },
    );
  });

  it('EF-2 — conserve le fichier d’origine comme source de la tentative', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [{ version: 1 }],
      [{ id: IMPORT }],
      [profileRow()],
      [],
      [formationRow({ status: 'programme_proposed' })],
      [{ version: 1 }],
      [],
      [],
      [],
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 2, source: 'imported', import_id: IMPORT })],
      [{ count: 0 }],
    ]);
    mocks.run.mockResolvedValue(generatedDraft());

    const result = await importProposal(context(execute), FORMATION, {
      kind: 'file',
      expectedVersion: 1,
      filename: 'programme.txt',
      contentBase64: Buffer.from('Module 1\nChapitre 1\nNotion 1').toString('base64'),
    });
    expect(result).toMatchObject({
      ok: true,
      value: { proposal: { version: 2, source: 'imported' } },
    });
    const call = mocks.run.mock.calls[0] as RunCall | undefined;
    if (call === undefined) throw new Error('runProgrammeDraft non appelé');
    expect(call[1].documents[0]?.source).toBe('programme.txt');
  });

  it('marque l’import en échec quand le tuteur ne répond pas', async () => {
    const execute = sequence([
      [formationRow({ status: 'cadrage' })],
      [{ version: 0 }],
      [{ id: IMPORT }],
      [profileRow()],
      [],
    ]);
    mocks.run.mockResolvedValue({
      ok: false,
      error: new AppError('AI_TASK_FAILED', 'Sortie invalide.'),
    });

    const result = await importProposal(context(execute), FORMATION, TEXT_INPUT);
    expect(result).toMatchObject({ ok: false, error: { code: 'AI_TASK_FAILED' } });
    // Four preparation reads plus the failed-status update; no proposal is written.
    expect(execute).toHaveBeenCalledTimes(5);
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('refuse un appelant anonyme et une extraction impossible', async () => {
    const anonymous = await importProposal(context(sequence([]), null), FORMATION, TEXT_INPUT);
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const empty = await importProposal(context(sequence([]), USER), FORMATION, {
      kind: 'text',
      expectedVersion: 0,
      text: '   ',
    });
    expect(empty).toMatchObject({ ok: false, error: { code: 'TEXT_EMPTY' } });
  });

  it('refuse une formation absente ou déjà active', async () => {
    const missing = await importProposal(context(sequence([[]])), FORMATION, TEXT_INPUT);
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const active = await importProposal(
      context(sequence([[formationRow({ status: 'active' })]])),
      FORMATION,
      TEXT_INPUT,
    );
    expect(active).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation a déjà un programme actif.' },
    });
  });

  it('refuse une version périmée et un import non enregistré', async () => {
    const stale = await importProposal(
      context(sequence([[formationRow()], [{ version: 2 }]])),
      FORMATION,
      TEXT_INPUT,
    );
    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'La proposition a changé : rechargez la version actuelle.',
      },
    });

    const unsaved = await importProposal(
      context(sequence([[formationRow()], [{ version: 0 }], []])),
      FORMATION,
      TEXT_INPUT,
    );
    expect(unsaved).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'L’import n’a pas pu être enregistré.' },
    });
  });

  it('re-vérifie la formation et la version sous le verrou', async () => {
    mocks.run.mockResolvedValue(generatedDraft());
    const missing = await importProposal(
      context(
        sequence([[formationRow()], [{ version: 0 }], [{ id: IMPORT }], [profileRow()], [], []]),
      ),
      FORMATION,
      TEXT_INPUT,
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const stale = await importProposal(
      context(
        sequence([
          [formationRow()],
          [{ version: 0 }],
          [{ id: IMPORT }],
          [profileRow()],
          [],
          [formationRow()],
          [{ version: 1 }],
        ]),
      ),
      FORMATION,
      TEXT_INPUT,
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
});
