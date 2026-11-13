// Unit tests of the « Mes lacunes » read model (SPEC-615 EF-1 to EF-3, ET-3 to ET-5). The
// transaction is a fake: these tests pin the projection, the independent counters, the filter,
// the validation and the RLS refusal, not SQL.
import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { listGaps } from './list-gaps';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '44444444-4444-4444-8444-444444444444';
const NOTION = '55555555-5555-4555-8555-555555555555';
const SECTION = '66666666-6666-4666-8666-666666666666';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>, userId = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-gaps',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function emptyContext(): ServiceContext {
  return {
    userId: null,
    requestId: 'req-gaps',
    db: null,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function formationRow() {
  return { id: FORMATION, title: 'SAP S/4HANA Finance', timezone: 'Europe/Paris' };
}

function gapRow(partial: Record<string, unknown> = {}) {
  return {
    notion_id: NOTION,
    notion_label: 'Comptabilité générale',
    nature: 'confusion',
    confused_with_label: 'Immobilisations',
    module_id: MODULE,
    module_position: 1,
    module_title: 'Comptabilité',
    chapter_id: CHAPTER,
    chapter_title: 'Chapitre 1',
    threshold: 80,
    mastery: 42,
    detected_at: '2026-11-10T09:00:00.000Z',
    revealed_by: 'confondue avec le type de pièce dans 2 réponses.',
    section_id: SECTION,
    section_anchor: 'cle-de-comptabilisation',
    ...partial,
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

describe('[SPEC-615] liste des lacunes', () => {
  it('projette statistiques, compteurs, cartes et prochaine révision (EF-1, EF-2)', async () => {
    const execute = sequence([
      [formationRow()],
      [{ open_gaps: 2, mastered_notions: 1, gap_modules: [1, 2], mastered_modules: [2] }],
      [{ forgetting: 1, confusion: 1, misunderstanding: 0, application: 0 }],
      [
        gapRow(),
        gapRow({
          notion_id: '77777777-7777-4777-8777-777777777777',
          notion_label: 'TVA',
          nature: 'forgetting',
          confused_with_label: null,
          module_position: 2,
          module_title: 'Fiscalité',
          detected_at: null,
          revealed_by: '',
          section_id: null,
          section_anchor: null,
        }),
      ],
      [{ next_review_at: '2026-11-11T16:00:00Z' }],
    ]);

    const result = await listGaps(context(execute), { formationId: FORMATION });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('liste des lacunes attendue');
    expect(result.value).toMatchObject({
      formationId: FORMATION,
      formationTitle: 'SAP S/4HANA Finance',
      nature: null,
      summary: { openGaps: 2, masteredNotions: 1, gapModules: [1, 2], masteredModules: [2] },
      countsByNature: { forgetting: 1, confusion: 1, misunderstanding: 0, application: 0 },
      nextReviewAt: '2026-11-11T16:00:00.000Z',
      timezone: 'Europe/Paris',
      generatedAt: NOW.toISOString(),
    });
    expect(result.value.items).toHaveLength(2);
    expect(result.value.items[0]).toMatchObject({
      notionId: NOTION,
      nature: 'confusion',
      recommendedAction: 'confrontation',
      confusedWithLabel: 'Immobilisations',
      detectedAt: '2026-11-10T09:00:00.000Z',
      mastery: 42,
      threshold: 80,
      training: {
        kind: 'quiz',
        href: `/formations/${FORMATION}/quiz-global?cible=${NOTION}`,
      },
      course: {
        sectionId: SECTION,
        anchor: 'cle-de-comptabilisation',
        href: `/formations/${FORMATION}/modules/${MODULE}/cours?chapitre=${CHAPTER}#cle-de-comptabilisation`,
      },
    });
    expect(result.value.items[1]).toMatchObject({
      nature: 'forgetting',
      detectedAt: NOW.toISOString(),
      course: null,
      training: { kind: 'quiz' },
    });
  });

  it('filtre une nature sans changer les compteurs (EF-2)', async () => {
    const execute = sequence([
      [formationRow()],
      [{ open_gaps: 1, mastered_notions: 0, gap_modules: [1], mastered_modules: null }],
      [{ forgetting: 0, confusion: 1, misunderstanding: 0, application: 0 }],
      [gapRow()],
      [],
    ]);

    const result = await listGaps(context(execute), {
      formationId: FORMATION,
      nature: 'confusion',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        nature: 'confusion',
        summary: { openGaps: 1, masteredModules: [] },
        nextReviewAt: null,
        items: [{ nature: 'confusion' }],
      },
    });
  });

  it('accepte une nature nulle et un état vide sans lacune (CL-3)', async () => {
    const execute = sequence([[formationRow()], [], [], [], []]);

    const result = await listGaps(context(execute), { formationId: FORMATION, nature: null });

    expect(result).toMatchObject({
      ok: true,
      value: {
        nature: null,
        summary: { openGaps: 0, masteredNotions: 0, gapModules: [], masteredModules: [] },
        countsByNature: { forgetting: 0, confusion: 0, misunderstanding: 0, application: 0 },
        items: [],
        nextReviewAt: null,
      },
    });
  });

  it('refuse une nature inconnue sans ouvrir de transaction (CL-1)', async () => {
    const execute = vi.fn();

    const result = await listGaps(context(execute), {
      formationId: FORMATION,
      nature: 'unknown' as never,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED', detail: 'Nature de lacune inconnue.' },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuse une formation étrangère sans révéler son existence (CA-4)', async () => {
    const result = await listGaps(context(sequence([[]])), { formationId: FORMATION });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('refuse un appel sans session', async () => {
    await expect(listGaps(emptyContext(), { formationId: FORMATION })).resolves.toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });
});
