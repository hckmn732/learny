// Unit tests of the programme reads and projection (SPEC-605 ET-1, ET-3, ET-5). The transaction
// and the owner-role client are fakes: these tests pin the RLS-shaped reads, the version selection
// and the active-structure merge, not SQL.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbTx } from '@learny/db';

import {
  CHAPTER_1,
  CHAPTER_2,
  FORMATION,
  MODULE_1,
  MODULE_2,
  NOW,
  USER,
  formationRow,
  profileRow,
  proposalRow,
  programmePayload,
  sequence,
} from '../../test/support/programme';

import {
  activeFormationCount,
  buildProposalDto,
  cadrageCompleted,
  currentVersion,
  listProposals,
  readFormation,
  readProfile,
  readProgrammeState,
  readProposal,
} from './state';

const mocks = vi.hoisted(() => {
  const serviceExecute = vi.fn();
  return {
    serviceExecute,
    serviceDb: vi.fn(() => ({ execute: serviceExecute })),
  };
});

vi.mock('@learny/db', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  serviceDb: mocks.serviceDb,
}));

beforeEach(() => {
  mocks.serviceExecute.mockReset().mockResolvedValue([]);
});

function tx(execute: ReturnType<typeof vi.fn>): DbTx {
  return { execute } as unknown as DbTx;
}

function active() {
  return {
    modules: [
      {
        id: MODULE_1,
        position: 1,
        title: 'Module actif 1',
        objectives: ['Objectif actif 1'],
        planned_start: '2026-11-03',
        planned_end: '2026-11-07',
        threshold: 90,
        status: 'open',
      },
      {
        id: MODULE_2,
        position: 2,
        title: 'Module actif 2',
        objectives: ['Objectif actif 2'],
        planned_start: '2026-11-10',
        planned_end: '2026-11-14',
        threshold: 70,
        status: 'locked',
      },
    ],
    chapters: [
      { id: CHAPTER_1, module_id: MODULE_1, position: 1, title: 'Chapitre actif 1' },
      { id: CHAPTER_2, module_id: MODULE_2, position: 1, title: 'Chapitre actif 2' },
    ],
    notions: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        chapter_id: CHAPTER_1,
        label: 'Notion active',
        short_definition: 'Définition active.',
      },
    ],
  };
}

describe('[SPEC-605] lectures du programme', () => {
  it('lit la formation et le profil sous le client de l’apprenant (ET-1)', async () => {
    const execute = sequence([
      [formationRow()],
      [],
      [profileRow({ tutor_tone: 'vous', course_language: 'en' })],
      [],
    ]);

    await expect(readFormation(tx(execute), USER, FORMATION)).resolves.toMatchObject({
      id: FORMATION,
      title: 'SAP S/4HANA Finance',
    });
    await expect(readFormation(tx(execute), USER, FORMATION)).resolves.toBeNull();
    await expect(readProfile(tx(execute), USER)).resolves.toEqual({
      tone: 'vous',
      courseLanguage: 'en',
      timezone: 'Europe/Paris',
    });
    // A missing profile row keeps the documented fallbacks.
    await expect(readProfile(tx(execute), USER)).resolves.toEqual({
      tone: 'vous',
      courseLanguage: 'fr',
      timezone: 'Europe/Paris',
    });
  });

  it('lit les versions de propositions et compte les formations actives', async () => {
    const first = proposalRow({ version: 2 });
    const second = proposalRow({ version: 1 });
    const execute = sequence([
      [first, second],
      [second],
      [],
      [{ version: 2 }],
      [],
      [{ count: 1 }],
      [],
    ]);

    await expect(listProposals(tx(execute), FORMATION)).resolves.toEqual([first, second]);
    await expect(readProposal(tx(execute), FORMATION, 1)).resolves.toEqual(second);
    await expect(readProposal(tx(execute), FORMATION, 9)).resolves.toBeNull();
    await expect(currentVersion(tx(execute), FORMATION)).resolves.toBe(2);
    // No proposal yet: version 0, never null.
    await expect(currentVersion(tx(execute), FORMATION)).resolves.toBe(0);
    await expect(activeFormationCount(tx(execute), USER, FORMATION)).resolves.toBe(1);
    await expect(activeFormationCount(tx(execute), USER, FORMATION)).resolves.toBe(0);
  });

  it('EF-4 — le cadrage est terminé seulement si l’événement outbox existe', async () => {
    mocks.serviceExecute.mockResolvedValueOnce([{ present: true }]).mockResolvedValueOnce([]);

    await expect(cadrageCompleted(FORMATION)).resolves.toBe(true);
    await expect(cadrageCompleted(FORMATION)).resolves.toBe(false);
    expect(mocks.serviceDb).toHaveBeenCalledTimes(2);
  });

  it('projette une proposition non active avec les valeurs de la charge stockée', () => {
    const payload = programmePayload();
    const dto = buildProposalDto({
      formation: formationRow({ status: 'programme_proposed' }),
      proposal: proposalRow({ version: 1, payload }),
      proposals: [proposalRow({ version: 1, payload })],
      activeCount: 2,
    });

    expect(dto).toMatchObject({
      formationId: FORMATION,
      version: 1,
      proposalStatus: 'proposed',
      title: 'SAP S/4HANA Finance',
      description: 'Formation de test.',
      summary: 'Deux modules.',
      volumeHours: 20,
      activeFormationCount: 2,
    });
    expect(dto.modules.map((module) => module.title)).toEqual(['Module 1', 'Module 2']);
    expect(dto.modules[0]).toMatchObject({
      position: 1,
      status: null,
      threshold: 80,
      chapters: [{ position: 1, title: 'Chapitre 1' }],
    });
    expect(dto.versions).toEqual([expect.objectContaining({ version: 1, current: true })]);
  });

  it('fusionne la structure active avec la charge de la proposition courante', () => {
    const payload = programmePayload();
    const current = proposalRow({ version: 2, payload, summary: 'Résumé de la version 2.' });
    const previous = proposalRow({ version: 1, payload });
    const dto = buildProposalDto({
      formation: formationRow({
        status: 'active',
        description: 'Description officielle.',
      }),
      proposal: current,
      proposals: [current, previous],
      activeCount: 1,
      active: active(),
    });

    expect(dto).toMatchObject({
      version: 2,
      proposalStatus: 'active',
      description: 'Description officielle.',
      summary: 'Résumé de la version 2.',
      volumeHours: 20,
    });
    expect(dto.modules[0]).toMatchObject({
      title: 'Module actif 1',
      objectives: ['Objectif actif 1'],
      plannedStart: '2026-11-03',
      plannedEnd: '2026-11-07',
      threshold: 90,
      status: 'open',
      chapters: [{ title: 'Chapitre actif 1' }],
    });
    expect(dto.modules[0]?.chapters[0]?.notions).toEqual([
      { label: 'Notion active', definition: 'Définition active.' },
    ]);
    // No stored notion for the second chapter: the payload stays the source of the notions.
    expect(dto.modules[1]?.chapters[0]?.notions).toEqual(payload.modules[1]?.chapters[0]?.notions);
    expect(dto.versions.map((version) => version.current)).toEqual([true, false]);
  });

  it('ET-4 — refuse une formation absente et expose l’état sans proposition', async () => {
    const missing = sequence([[]]);
    await expect(readProgrammeState(tx(missing), USER, FORMATION)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    mocks.serviceExecute.mockResolvedValueOnce([]);
    const execute = sequence([[formationRow({ status: 'cadrage' })], [], [{ count: 0 }]]);
    const result = await readProgrammeState(tx(execute), USER, FORMATION);
    expect(result).toMatchObject({
      formationId: FORMATION,
      formationStatus: 'cadrage',
      cadrageCompleted: false,
      proposal: null,
    });
  });

  it('ET-5 — lit une ancienne version sans la confondre avec la courante', async () => {
    const current = proposalRow({ version: 2 });
    const previous = proposalRow({ version: 1 });
    const execute = sequence([
      [formationRow({ status: 'active' })],
      [current, previous],
      [{ count: 1 }],
    ]);

    const result = await readProgrammeState(tx(execute), USER, FORMATION, {
      version: 1,
      completed: true,
    });
    expect(result).toMatchObject({
      formationStatus: 'active',
      proposal: { version: 1, proposalStatus: 'proposed' },
    });
    expect(result.proposal?.versions.map((version) => version.current)).toEqual([true, false]);
  });

  it('ET-5 — une version inconnue renvoie un état sans proposition', async () => {
    const execute = sequence([
      [formationRow({ status: 'programme_proposed' })],
      [proposalRow({ version: 1 })],
      [{ count: 0 }],
    ]);

    const result = await readProgrammeState(tx(execute), USER, FORMATION, {
      version: 99,
      completed: true,
    });
    expect(result.proposal).toBeNull();
  });

  it('ET-3 — la dernière version d’une formation active porte la structure persistée', async () => {
    const current = proposalRow({ version: 2 });
    const activeRows = active();
    const execute = sequence([
      [formationRow({ status: 'active' })],
      [current, proposalRow({ version: 1 })],
      [{ count: 1 }],
      activeRows.modules,
      activeRows.chapters,
      activeRows.notions,
    ]);

    const result = await readProgrammeState(tx(execute), USER, FORMATION, { completed: true });
    expect(result).toMatchObject({
      formationStatus: 'active',
      cadrageCompleted: true,
      proposal: {
        version: 2,
        proposalStatus: 'active',
        modules: [
          { title: 'Module actif 1', status: 'open' },
          { title: 'Module actif 2', status: 'locked' },
        ],
      },
    });
    expect(result.proposal?.createdAt).toBe(NOW.toISOString());
  });
});
