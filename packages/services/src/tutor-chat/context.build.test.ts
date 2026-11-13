// Unit tests of the server-side context build (SPEC-610 ET-4, BR-TUT-02, ADR-0178): the six SQL
// reads under the caller's RLS client are replaced by an in-memory transaction that answers each
// query, so the assembled context, sources, passage label and gap-first flag are pinned without
// any real row.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserDatabase } from '@learny/db';

import { silentLogger, TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { buildContext } from './context';

const mocks = vi.hoisted(() => ({
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    text: strings.join('?'),
    values,
  })),
}));

vi.mock('@learny/db', () => ({ sql: mocks.sql }));

const USER = '11111111-1111-4111-8111-111111111111';
const COURSE = '22222222-2222-4222-8222-222222222222';
const CHAPTER = '33333333-3333-4333-8333-333333333333';
const CONV = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-11T12:20:00Z');

const meta = {
  formation_id: 'f1',
  formation_title: 'SAP S/4HANA Finance',
  objectives: ['operational', 'exam'],
  cadrage_profile: { starting_point: { value: 'Bonnes bases', state: 'done' } },
  module_id: 'm1',
  module_position: 3,
  module_title: 'Comptabilité générale',
  chapter_id: CHAPTER,
  chapter_position: 2,
  chapter_title: 'Saisie des pièces comptables',
  course_id: COURSE,
  course_version: 1,
  percent: 45,
  tutor_tone: 'vous',
  course_language: 'fr',
};

const section = {
  id: 's2',
  kind: 'dont_confuse',
  anchor: 'b',
  title: 'Ne pas confondre',
  content_md: null,
  data: { left: { title: 'Clé de comptabilisation' }, right: { title: 'Type de pièce' } },
  notion_ids: ['n4', 'n5'],
};

const resource = { id: 'r1', title: 'Guide FI (PDF)', kind: 'pdf' };

const chunk = {
  chunk_id: '11111111-1111-4111-8111-111111111111',
  resource_id: 'r1',
  title: 'Guide FI (PDF)',
  kind: 'pdf',
  text: 'Toute écriture est une pièce.',
  location: { page: 4 },
};

function context(execute: ReturnType<typeof vi.fn>): ServiceContext {
  return {
    userId: USER,
    requestId: 'req-context',
    db: { run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as UserDatabase,
    clock: new TestClock(NOW.toISOString()),
    logger: silentLogger(),
  };
}

function database(rows: {
  meta?: unknown[];
  resources?: unknown[];
  gap?: unknown[];
  sections?: unknown[];
  notions?: unknown[];
  chunks?: unknown[];
}) {
  return vi.fn((query: { text: string }) => {
    const text = query.text;
    if (text.includes('f.id::text as formation_id')) return rows.meta ?? [meta];
    if (text.includes('from public.resources r')) return rows.resources ?? [resource];
    if (text.includes('from public.notion_states ns')) return rows.gap ?? [];
    if (text.includes('from public.course_sections s')) return rows.sections ?? [section];
    if (text.includes('select distinct n.id'))
      return rows.notions ?? [{ id: 'n4', label: 'Clé de comptabilisation' }];
    if (text.includes('from public.resource_chunks c')) return rows.chunks ?? [chunk];
    return [];
  });
}

beforeEach(() => {
  mocks.sql.mockClear();
});

describe('[SPEC-610] construction du contexte côté serveur', () => {
  it('assemble les six éléments, les sources et le passage sélectionné', async () => {
    const built = await buildContext(
      context(
        database({
          gap: [
            {
              notion_id: 'n4',
              label: 'Clé de comptabilisation',
              nature: 'confusion',
              mastery: '35.4',
              confused_with: 'Type de pièce',
            },
          ],
        }),
      ),
      { id: CONV, courseId: COURSE, chapterId: CHAPTER },
      { include: {}, passage: { text: 'Les postes portent une clé.', sectionId: 's2' } },
      'Je ne comprends pas la clé de comptabilisation',
    );
    expect(built.includedKeys).toEqual([
      'formation',
      'chapter',
      'passage',
      'resources',
      'gap',
      'profile',
    ]);
    expect(built.promptBlock).toContain(
      '<formation>SAP S/4HANA Finance · être opérationnel et préparer la certification</formation>',
    );
    expect(built.promptBlock).toContain(
      '<document source="selection" section="s2">Les postes portent une clé.</document>',
    );
    expect(built.promptBlock).toContain(
      '<gap>Clé de comptabilisation · confondue avec Type de pièce · maîtrise 35 %</gap>',
    );
    expect(built.promptBlock).toContain('<profile>Bonnes bases</profile>');
    expect(built.sources).toEqual([
      {
        chunkId: chunk.chunk_id,
        resourceId: 'r1',
        title: 'Guide FI (PDF)',
        kind: 'pdf',
        location: { page: 4 },
      },
    ]);
    expect(built.passageLabel).toBe('Ne pas confondre');
    expect(built.passagePreview).toBe('Les postes portent une clé.');
    expect(built.gapFirst).toBe(true);
    expect(built.gapNotionId).toBe('n4');
    expect(built.gapNatureText).toBe('se confond encore avec Type de pièce');
    expect(built.confusion).toEqual({
      left: 'Clé de comptabilisation',
      right: 'Type de pièce',
    });
    expect(built.notionLabels).toEqual({ n4: 'Clé de comptabilisation' });
    expect(built.resourceTitles).toEqual(['Guide FI (PDF)']);
    expect(built.primaryResourceTitle).toBe('Guide FI (PDF)');
    expect(built.chapterPosition).toBe(2);
    expect(built.courseId).toBe(COURSE);
  });

  it('ignore un passage trop court et fonctionne sans lacune ni apport', async () => {
    const built = await buildContext(
      context(database({ resources: [], chunks: [], sections: [] })),
      { id: CONV, courseId: COURSE, chapterId: CHAPTER },
      { include: { gap: false }, passage: { text: 'trop court' } },
      'Parle-moi des dates comptables',
    );
    expect(built.items.map((item) => item.key)).toEqual([
      'formation',
      'chapter',
      'resources',
      'profile',
    ]);
    expect(built.passageLabel).toBeNull();
    expect(built.sources).toEqual([]);
    expect(built.primaryResourceTitle).toBeNull();
    expect(built.gapFirst).toBe(false);
    expect(built.gapNotionId).toBeNull();
    expect(built.items.find((item) => item.key === 'resources')?.value).toBe(
      'Aucun apport : le tuteur s’appuie sur le cours',
    );
  });

  it('échoue quand la discussion est introuvable sous la RLS', async () => {
    await expect(
      buildContext(
        context(database({ meta: [] })),
        { id: CONV, courseId: COURSE, chapterId: CHAPTER },
        { include: {} },
        'Bonjour',
      ),
    ).rejects.toThrow('conversation introuvable');
  });
});
