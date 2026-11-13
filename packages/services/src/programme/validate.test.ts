// Unit tests of the programme validation (SPEC-605 EF-4, ET-2, ET-4, ET-5). The transaction and
// the outbox are fakes: these tests pin the version lock, the three-active limit, the created
// structure and the activation, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAPTER_1,
  CHAPTER_2,
  FORMATION,
  MODULE_1,
  MODULE_2,
  USER,
  context,
  formationRow,
  proposalRow,
  sequence,
} from '../../test/support/programme';

import { validateProposal } from './validate';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
}));

vi.mock('@learny/jobs', () => ({ emitAfterCommit: mocks.emit }));

const INPUT = { expectedVersion: 1 };

beforeEach(() => {
  mocks.emit.mockReset().mockResolvedValue(undefined);
});

function createdRows() {
  return [
    [],
    [formationRow({ status: 'programme_proposed' })],
    [{ version: 1 }],
    [proposalRow({ version: 1 })],
    [{ count: 0 }],
    [{ id: MODULE_1 }],
    [],
    [{ id: CHAPTER_1 }],
    [],
    [{ id: MODULE_2 }],
    [],
    [{ id: CHAPTER_2 }],
    [],
    [],
    [formationRow({ status: 'active' })],
    [proposalRow({ version: 1 })],
    [{ count: 1 }],
    [
      {
        id: MODULE_1,
        position: 1,
        title: 'Module 1',
        objectives: ['O'],
        planned_start: '2026-11-02',
        planned_end: '2026-11-06',
        threshold: 80,
        status: 'open',
      },
      {
        id: MODULE_2,
        position: 2,
        title: 'Module 2',
        objectives: ['O'],
        planned_start: '2026-11-09',
        planned_end: '2026-11-13',
        threshold: 75,
        status: 'locked',
      },
    ],
    [
      { id: CHAPTER_1, module_id: MODULE_1, position: 1, title: 'Chapitre 1' },
      { id: CHAPTER_2, module_id: MODULE_2, position: 1, title: 'Chapitre 2' },
    ],
    [],
  ];
}

describe('[SPEC-605] validation du programme', () => {
  it('EF-4 — crée modules, chapitres et notions puis active la formation', async () => {
    const execute = sequence(createdRows());

    const result = await validateProposal(context(execute), FORMATION, INPUT);
    expect(result).toMatchObject({
      ok: true,
      value: {
        formationId: FORMATION,
        formationStatus: 'active',
        proposal: { version: 1, proposalStatus: 'active' },
      },
    });
    expect(execute).toHaveBeenCalledTimes(20);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.anything(),
      'formation/programme-validated',
      {
        userId: USER,
        formationId: FORMATION,
        validatedAt: '2026-11-11T12:20:00.000Z',
      },
      { id: `programme-validated:${FORMATION}` },
    );
  });

  it('EF-4 — une proposition importée marque les notions comme créées par l’import', async () => {
    const rows = createdRows();
    rows[3] = [proposalRow({ version: 1, source: 'imported' })];
    const execute = sequence(rows);

    const result = await validateProposal(context(execute), FORMATION, INPUT);
    expect(result).toMatchObject({ ok: true, value: { formationStatus: 'active' } });
  });

  it('refuse un appelant anonyme et une formation absente', async () => {
    const anonymous = await validateProposal(context(sequence([]), null), FORMATION, INPUT);
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const missing = await validateProposal(context(sequence([[], []])), FORMATION, INPUT);
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse une formation déjà validée ou non activable', async () => {
    const active = await validateProposal(
      context(sequence([[], [formationRow({ status: 'active' })]])),
      FORMATION,
      INPUT,
    );
    expect(active).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Ce programme est déjà validé.' },
    });

    const completed = await validateProposal(
      context(sequence([[], [formationRow({ status: 'completed' })]])),
      FORMATION,
      INPUT,
    );
    expect(completed).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: 'Cette formation ne peut pas être activée.' },
    });
  });

  it('refuse une version périmée, une proposition absente ou illisible', async () => {
    const stale = await validateProposal(
      context(sequence([[], [formationRow({ status: 'programme_proposed' })], [{ version: 2 }]])),
      FORMATION,
      INPUT,
    );
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    const missing = await validateProposal(
      context(
        sequence([[], [formationRow({ status: 'programme_proposed' })], [{ version: 1 }], []]),
      ),
      FORMATION,
      INPUT,
    );
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const corrupt = await validateProposal(
      context(
        sequence([
          [],
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1, payload: { modules: [] } })],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(corrupt).toMatchObject({ ok: false, error: { code: 'PROGRAMME_INCOMPLETE' } });
  });

  it('applique la limite de trois formations actives (BR-FOR-10)', async () => {
    const result = await validateProposal(
      context(
        sequence([
          [],
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1 })],
          [{ count: 3 }],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FORMATION_LIMIT_REACHED', status: 422 },
    });
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('interrompt la création si une ligne structurante manque', async () => {
    const moduleFailed = await validateProposal(
      context(
        sequence([
          [],
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1 })],
          [{ count: 0 }],
          [],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(moduleFailed).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Le module n’a pas pu être créé.' },
    });

    const chapterFailed = await validateProposal(
      context(
        sequence([
          [],
          [formationRow({ status: 'programme_proposed' })],
          [{ version: 1 }],
          [proposalRow({ version: 1 })],
          [{ count: 0 }],
          [{ id: MODULE_1 }],
          [],
          [],
        ]),
      ),
      FORMATION,
      INPUT,
    );
    expect(chapterFailed).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'Le chapitre n’a pas pu être créé.' },
    });
  });
});
