// Unit tests of the full course read model (SPEC-608 EF-1 to EF-5, SPEC-609 BR-COU-02/07/08/11).
// The transaction is a fake: these tests pin the typed sections, their verified citations, the
// pending suggestions, the persisted progress and the generation states.

import { describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getModuleCourse } from './get-course';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE = '33333333-3333-4333-8333-333333333333';
const CHAPTER = '44444444-4444-4444-8444-444444444444';
const CHAPTER_2 = '99999999-9999-4999-8999-999999999999';
const COURSE = '55555555-5555-4555-8555-555555555555';
const SECTION_1 = '66666666-6666-4666-8666-666666666666';
const SECTION_2 = '77777777-7777-4777-8777-777777777777';
const CITATION = '88888888-8888-4888-8888-888888888888';
const RESOURCE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUGGESTION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUMMARY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-course-full',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function sequence(rows: readonly unknown[][]): ReturnType<typeof vi.fn> {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function moduleRow() {
  return {
    formation_id: FORMATION,
    formation_title: 'SAP S/4HANA Finance',
    module_id: MODULE,
    module_title: 'Comptabilité générale',
    module_position: 3,
    modules_total: 7,
    threshold: 80,
  };
}

function chapterRow(id: string, position: number, title: string) {
  return { id, position, title };
}

function courseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COURSE,
    version: 2,
    status: 'ready',
    model: 'mock',
    error: null,
    created_at: NOW,
    ...overrides,
  };
}

function sectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SECTION_1,
    chapter_id: CHAPTER,
    position: 1,
    kind: 'text',
    anchor: 'section-1',
    title: 'Introduction',
    content_md: 'Bonjour le monde comptable.',
    data: null,
    origin: 'resource',
    notion_ids: `{${NOTION}}`,
    version: 1,
    reported: false,
    ...overrides,
  };
}

function citationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CITATION,
    section_id: SECTION_1,
    chunk_id: null,
    resource_id: RESOURCE,
    quote: 'Toute écriture comptable est une pièce.',
    location: { page: 4 },
    label: 'Guide FI',
    media_kind: 'pdf',
    deleted: false,
    ...overrides,
  };
}

const FEEDBACK = {
  verdict: 'good' as const,
  message: 'Résumé complet.',
  missing: [],
};

describe('[SPEC-608] lecture détaillée du cours', () => {
  it('rend les sections typées, citations, suggestions, progression et résumé (EF-1 à EF-5)', async () => {
    const execute = sequence([
      [moduleRow()],
      [chapterRow(CHAPTER, 1, 'Plan comptable'), chapterRow(CHAPTER_2, 2, 'Saisie')],
      [courseRow()],
      [courseRow()],
      [{ chapter_id: CHAPTER, total: 2 }],
      [{ chapter_id: CHAPTER, percent: 60 }],
      [
        sectionRow(),
        sectionRow({
          id: SECTION_2,
          position: 2,
          kind: 'retain',
          anchor: 'section-2',
          title: null,
          content_md: null,
          data: {
            points: ['La clé 40 débite', 'La clé 50 crédite'],
            mnemonic: 'D pour Débit',
            left: { title: 'Débit', body: 'Emploi', example: 'Achat' },
            right: { title: 'Crédit' },
          },
          origin: 'tutor',
          notion_ids: [NOTION],
          version: 2,
          reported: true,
        }),
      ],
      [citationRow()],
      [{ total: 0 }],
      [
        {
          id: SUGGESTION,
          title: 'Plan comptable officiel',
          url: 'https://doc.test/plan',
          reason: null,
        },
      ],
      [
        {
          id: SUMMARY,
          chapter_id: CHAPTER,
          course_id: COURSE,
          text: 'Une pièce a un en-tête.',
          feedback: FEEDBACK,
          created_at: NOW,
        },
      ],
    ]);

    const result = await getModuleCourse(context(execute), MODULE);

    expect(result).toMatchObject({
      ok: true,
      value: {
        formation: { id: FORMATION },
        module: { id: MODULE, position: 3, positionTotal: 7 },
        selectedChapterId: CHAPTER,
        generation: { status: 'ready', version: 2, error: null },
        chapters: [
          { id: CHAPTER, hasCourse: true, percent: 60 },
          { id: CHAPTER_2, hasCourse: false, percent: 0 },
        ],
        course: {
          id: COURSE,
          status: 'ready',
          baseCourse: true,
          resourceCount: 0,
          previousChapterId: null,
          nextChapterId: CHAPTER_2,
          chapter: { id: CHAPTER, hasCourse: true, percent: 60 },
          progress: { chapterPercent: 60, coursePercent: 60, updatedAt: null },
          summary: { id: SUMMARY, status: 'corrected', feedback: FEEDBACK },
          suggestions: [
            {
              id: SUGGESTION,
              title: 'Plan comptable officiel',
              url: 'https://doc.test/plan',
              reason: 'Ressource suggérée par le tuteur.',
            },
          ],
          quiz: { threshold: 80, href: `/formations/${FORMATION}/modules/${MODULE}` },
        },
      },
    });

    const course = result.ok ? result.value.course : null;
    expect(course?.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(course?.sections).toHaveLength(2);
    expect(course?.sections[0]).toMatchObject({
      id: SECTION_1,
      origin: 'resource',
      notionIds: [NOTION],
      citations: [{ id: CITATION, label: 'Guide FI', location: { page: 4 }, deleted: false }],
    });
    expect(course?.sections[1]).toMatchObject({
      id: SECTION_2,
      origin: 'tutor',
      reported: true,
      data: { mnemonic: 'D pour Débit' },
      citations: [],
    });
  });

  it('sélectionne un autre chapitre et calcule les voisins', async () => {
    const execute = sequence([
      [moduleRow()],
      [chapterRow(CHAPTER, 1, 'Plan comptable'), chapterRow(CHAPTER_2, 2, 'Saisie')],
      [courseRow()],
      [courseRow()],
      [{ chapter_id: CHAPTER, total: 1 }],
      [{ chapter_id: CHAPTER, percent: 100 }],
      [],
      [{ total: 0 }],
      [],
      [],
    ]);

    await expect(getModuleCourse(context(execute), MODULE, CHAPTER_2)).resolves.toMatchObject({
      ok: true,
      value: {
        selectedChapterId: CHAPTER_2,
        course: {
          chapter: { id: CHAPTER_2, position: 2 },
          previousChapterId: CHAPTER,
          nextChapterId: null,
          sections: [],
          progress: { chapterPercent: 0, coursePercent: 100 },
        },
      },
    });
  });

  it('rend une génération en cours sans cours courant (EF-5)', async () => {
    const execute = sequence([
      [moduleRow()],
      [chapterRow(CHAPTER, 1, 'Plan comptable')],
      [],
      [courseRow({ status: 'generating', version: 1 })],
    ]);

    await expect(getModuleCourse(context(execute), MODULE)).resolves.toMatchObject({
      ok: true,
      value: {
        course: null,
        generation: { status: 'generating', version: 1, error: null },
      },
    });
  });

  it('rend un échec de génération avec son message (EF-5)', async () => {
    const execute = sequence([
      [moduleRow()],
      [chapterRow(CHAPTER, 1, 'Plan comptable')],
      [],
      [courseRow({ status: 'failed', version: 1, error: 'Modèle indisponible.' })],
    ]);

    await expect(getModuleCourse(context(execute), MODULE)).resolves.toMatchObject({
      ok: true,
      value: {
        course: null,
        generation: { status: 'failed', version: 1, error: 'Modèle indisponible.' },
      },
    });
  });
});
