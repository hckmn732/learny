// Unit tests of the programme generation (SPEC-605 EF-1, ET-4). The transaction, the tutor, the
// outbox and the owner-role client are fakes: these tests pin the guards, the committed draft and
// the web-context disclaimer, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import type { DbTx, UserDatabase } from '@learny/db';

import {
  FORMATION,
  USER,
  context,
  formationRow,
  profileRow,
  programmeDraft,
  proposalRow,
  sequence,
} from '../../test/support/programme';

import {
  emitAdjustmentRequested,
  generateProposal,
  programmeLock,
  searchContext,
  tutorProfile,
} from './generate';

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    run: vi.fn(),
    scenario: vi.fn(() => 'programme-generate'),
    searchWeb: vi.fn(),
    emit: vi.fn(),
    serviceExecute,
    serviceDb: vi.fn(() => ({ execute: serviceExecute })),
  };
});

vi.mock('@learny/tutor', () => ({
  programmeScenario: mocks.scenario,
  runProgrammeDraft: mocks.run,
  searchWeb: mocks.searchWeb,
}));

vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

beforeEach(() => {
  mocks.run.mockReset();
  mocks.scenario.mockClear();
  mocks.searchWeb.mockReset().mockResolvedValue({
    ok: true,
    value: {
      results: [{ title: 'Comptabilité générale', url: 'https://example.test/comptabilite' }],
    },
  });
  mocks.emit.mockReset().mockResolvedValue(undefined);
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
});

function generatedDraft() {
  return {
    ok: true as const,
    value: { draft: programmeDraft(), attempts: 1, promptId: 'programme', promptVersion: 1 },
  };
}

describe('[SPEC-605] génération du programme', () => {
  it('EF-1 — génère une version 1 et active la proposition après le cadrage', async () => {
    const execute = sequence([
      [
        formationRow({
          cadrage_profile: {
            scope: { value: 'SAP', state: 'done' },
            dates: { value: null, state: 'todo' },
            empty: { value: '   ', state: 'done' },
            text: 'pas un objet',
            list: ['pas un objet'],
          },
        }),
      ],
      [{ version: 0 }],
      [profileRow({ tutor_tone: 'tu', course_language: 'en' })],
      [],
      [formationRow()],
      [{ version: 0 }],
      [],
      [],
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 1 })],
      [{ count: 0 }],
    ]);
    mocks.run.mockResolvedValue(generatedDraft());

    const result = await generateProposal(context(execute), FORMATION, {});
    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        formationStatus: 'programme_proposed',
        proposal: { version: 1, proposalStatus: 'proposed' },
      },
    });
    expect(execute).toHaveBeenCalledTimes(11);

    const call = mocks.run.mock.calls[0] as
      [Record<string, unknown>, { title: string; context: string }] | undefined;
    if (call === undefined) throw new Error('runProgrammeDraft non appelé');
    const [scope, input] = call;
    expect(scope).toMatchObject({
      userId: USER,
      formationId: FORMATION,
      profile: { tone: 'tu', courseLanguage: 'en' },
      scenario: 'programme-generate',
    });
    expect(input).toMatchObject({ title: 'SAP S/4HANA Finance' });
    const contextJson = JSON.parse(input.context) as {
      cadrage: Record<string, string>;
      objectifs: string[];
      sourcesWeb: string;
    };
    expect(contextJson.cadrage).toEqual({ scope: 'SAP' });
    expect(contextJson.objectifs).toEqual(['operational']);
    expect(contextJson.sourcesWeb).toContain('https://example.test/comptabilite');
    expect(mocks.scenario).toHaveBeenCalledWith('generate', 'SAP S/4HANA Finance');
  });

  it('utilise le repli documenté quand la recherche web est indisponible ou vide', async () => {
    const first = context(sequence([]));
    mocks.searchWeb.mockResolvedValueOnce({
      ok: false,
      error: new AppError('AI_UNAVAILABLE', 'hors ligne'),
    });
    await expect(searchContext(first, { title: 'Comptabilité', scope: null })).resolves.toContain(
      'Recherche web indisponible',
    );

    mocks.searchWeb.mockResolvedValueOnce({ ok: true, value: { results: [] } });
    await expect(
      searchContext(first, { title: 'Comptabilité', scope: 'Bilan' }),
    ).resolves.toContain('Aucune source web pertinente');
    expect(mocks.searchWeb).toHaveBeenLastCalledWith(expect.anything(), {
      query: 'Comptabilité Bilan programme formation',
      purpose: 'programme',
      limit: 5,
    });
  });

  it('normalise la langue du profil et pose le verrou du programme', async () => {
    expect(tutorProfile({ tone: 'vous', courseLanguage: 'en' })).toEqual({
      tone: 'vous',
      courseLanguage: 'en',
    });
    expect(tutorProfile({ tone: 'tu', courseLanguage: 'de' })).toEqual({
      tone: 'tu',
      courseLanguage: 'fr',
    });

    const execute = sequence([[]]);
    await programmeLock({ execute } as unknown as DbTx, FORMATION);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('refuse un appelant anonyme et une formation absente (ET-4)', async () => {
    const anonymous = await generateProposal(context(sequence([]), null), FORMATION, {});
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const missing = await generateProposal(context(sequence([[]])), FORMATION, {});
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une formation déjà active ou qui ne peut plus recevoir de proposition', async () => {
    const active = await generateProposal(
      context(sequence([[formationRow({ status: 'active' })]])),
      FORMATION,
      {},
    );
    expect(active).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation a déjà un programme actif.' },
    });

    const archived = await generateProposal(
      context(sequence([[formationRow({ status: 'archived' })]])),
      FORMATION,
      {},
    );
    expect(archived).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation ne peut plus recevoir de proposition.' },
    });
  });

  it('refuse une version déjà proposée ou une version attendue périmée', async () => {
    const existing = await generateProposal(
      context(sequence([[formationRow({ status: 'programme_proposed' })], [{ version: 1 }]])),
      FORMATION,
      {},
    );
    expect(existing).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Un programme est déjà proposé : ajustez-le avec le tuteur.',
      },
    });

    const stale = await generateProposal(
      context(sequence([[formationRow()], [{ version: 0 }]])),
      FORMATION,
      { expectedVersion: 1 },
    );
    expect(stale).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'Le programme a changé : rechargez la proposition.',
      },
    });
  });

  it('remonte une panne du tuteur sans écrire de proposition', async () => {
    const execute = sequence([[formationRow()], [{ version: 0 }], [profileRow()]]);
    mocks.run.mockResolvedValue({
      ok: false,
      error: new AppError('AI_TASK_FAILED', 'Le tuteur est indisponible.'),
    });

    const result = await generateProposal(context(execute), FORMATION, {});
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'AI_TASK_FAILED', message: 'Le tuteur est indisponible.' },
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it('re-vérifie la version sous le verrou avant la seconde écriture', async () => {
    mocks.run.mockResolvedValue(generatedDraft());
    const missing = await generateProposal(
      context(sequence([[formationRow()], [{ version: 0 }], [profileRow()], [], []])),
      FORMATION,
      {},
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const stale = await generateProposal(
      context(
        sequence([
          [formationRow()],
          [{ version: 0 }],
          [profileRow()],
          [],
          [formationRow()],
          [{ version: 1 }],
        ]),
      ),
      FORMATION,
      {},
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('émet la demande d’ajustement avec un identifiant déterministe', async () => {
    const db = {} as UserDatabase;
    await emitAdjustmentRequested(db, {
      userId: USER,
      formationId: FORMATION,
      changeRequestId: '44444444-4444-4444-8444-444444444444',
    });
    expect(mocks.emit).toHaveBeenCalledWith(
      db,
      'formation/programme-requested',
      {
        userId: USER,
        formationId: FORMATION,
        changeRequestId: '44444444-4444-4444-8444-444444444444',
      },
      { id: 'programme-requested:44444444-4444-4444-8444-444444444444' },
    );
  });
});
