// Unit tests of the cadrage reads and title update (SPEC-604 EF-1, EF-11, EF-13, ET-1). The
// transaction is a fake: these tests pin the RLS-shaped reads, the page status, the list and the
// validated title update, not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getCadragePageState, getCadrageState, listFormations, updateFormationTitle } from './get';
import type { FormationRow, MessageRow } from './state';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MESSAGE = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>, userId = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-cadrage-get',
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
    created_at: '2026-11-11T10:00:00Z',
    ...partial,
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

describe('[SPEC-604] lecture du cadrage', () => {
  it('renvoie l’état complet de la formation (EF-1, ET-1)', async () => {
    const execute = sequence([[formation()], [message()]]);

    const result = await getCadrageState(context(execute), FORMATION);

    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        title: 'SAP S/4HANA Finance',
        messages: [{ id: MESSAGE, questionNumber: 1 }],
        questionsAsked: 1,
        pendingQuestion: { questionKey: 'scope', multi: false },
        canGenerate: false,
      },
    });
  });

  it('renvoie aussi le statut pour la redirection de page (EF-1)', async () => {
    const execute = sequence([[formation({ status: 'active' })], []]);

    const result = await getCadragePageState(context(execute), FORMATION);

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'active', state: { formationId: FORMATION, messages: [] } },
    });
  });

  it('refuse une formation absente ou étrangère (NOT_FOUND)', async () => {
    await expect(getCadrageState(context(sequence([[]])), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    await expect(getCadragePageState(context(sequence([[]])), FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });

  it('liste les formations de l’apprenant (EF-13)', async () => {
    const execute = sequence([
      [
        { id: FORMATION, title: 'SAP S/4HANA Finance', status: 'active' },
        { id: MESSAGE, title: 'Gestion de projet', status: 'cadrage' },
      ],
    ]);

    const result = await listFormations(context(execute));

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          { id: FORMATION, title: 'SAP S/4HANA Finance', status: 'active' },
          { id: MESSAGE, title: 'Gestion de projet', status: 'cadrage' },
        ],
      },
    });
  });

  it('met à jour le titre après validation (EF-11)', async () => {
    const execute = sequence([
      [formation()],
      [{ id: FORMATION, title: 'Nouveau titre', status: 'cadrage' }],
    ]);

    const result = await updateFormationTitle(context(execute), FORMATION, {
      title: 'Nouveau titre',
    });

    expect(result).toEqual({
      ok: true,
      value: { id: FORMATION, title: 'Nouveau titre', status: 'cadrage' },
    });
  });

  it('refuse un titre invalide, une formation absente et un appel anonyme', async () => {
    await expect(
      updateFormationTitle(context(sequence([[formation()]])), FORMATION, {}),
    ).rejects.toThrow();
    await expect(
      updateFormationTitle(context(sequence([[formation()]])), FORMATION, { title: '   ' }),
    ).rejects.toThrow();
    await expect(
      updateFormationTitle(context(sequence([[]])), FORMATION, { title: 'Nouveau' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const anonymous: ServiceContext = {
      userId: null,
      requestId: 'req-cadrage-get',
      db: null,
      clock: new TestClock(),
      logger: {} as never,
    };
    await expect(listFormations(anonymous)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    await expect(getCadrageState(anonymous, FORMATION)).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('refuse une mise à jour qui ne retourne aucune ligne', async () => {
    const execute = sequence([[formation()], []]);
    await expect(
      updateFormationTitle(context(execute), FORMATION, { title: 'Nouveau' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
