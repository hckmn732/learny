// Unit tests of the notion graph read model (SPEC-616 EF-1 to EF-5, ET-3 to ET-5). The
// transaction is a fake: these tests pin the mastery colours, the live course action, the open
// gaps, the source links and the statistics, not SQL.
import { describe, expect, it, vi } from 'vitest';

import { TestClock } from '../../test/support/fakes';
import type { ServiceContext } from '../context';

import { getNotionGraph } from './get-graph';

const USER = '11111111-1111-4111-8111-111111111111';
const FORMATION = '22222222-2222-4222-8222-222222222222';
const MODULE_1 = '33333333-3333-4333-8333-333333333333';
const MODULE_2 = '44444444-4444-4444-8444-444444444444';
const CHAPTER_1 = '55555555-5555-4555-8555-555555555555';
const CHAPTER_2 = '66666666-6666-4666-8666-666666666666';
const NOTION_1 = '77777777-7777-4777-8777-777777777777';
const NOTION_2 = '88888888-8888-4888-8888-888888888888';
const NOTION_3 = '99999999-9999-4999-8999-999999999999';
const NOTION_4 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RESOURCE_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RESOURCE_2 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NOW = new Date('2026-11-11T12:20:00Z');

function context(execute: ReturnType<typeof vi.fn>, userId: string | null = USER): ServiceContext {
  return {
    userId,
    requestId: 'req-notion-graph-unit',
    db:
      userId === null
        ? null
        : ({ run: (flow: (tx: unknown) => Promise<unknown>) => flow({ execute }) } as never),
    clock: new TestClock(NOW.toISOString()),
    logger: {} as never,
  };
}

function sequence(rows: readonly unknown[][]) {
  const execute = vi.fn();
  for (const value of rows) execute.mockResolvedValueOnce(value);
  return execute;
}

function notion(overrides: Record<string, unknown>) {
  return {
    id: NOTION_1,
    label: 'Notion 1',
    definition: 'Définition 1.',
    module_id: MODULE_1,
    chapter_id: CHAPTER_1,
    chapter_position: 1,
    notion_position: 1,
    module_position: 1,
    module_title: 'Module 1',
    threshold: 80,
    mastery: null,
    gap_nature: null,
    gap_cleared_at: null,
    section_id: null,
    section_anchor: null,
    ...overrides,
  };
}

describe('[SPEC-616] carte des notions', () => {
  it('ET-3/ET-4 — projette maîtrise, lacunes, apports et liens typés', async () => {
    const execute = sequence([
      [{ id: FORMATION, title: 'SAP S/4HANA Finance', timezone: 'Europe/Paris' }],
      [
        { id: MODULE_1, position: 1, title: 'Module 1', threshold: 80 },
        { id: MODULE_2, position: 2, title: 'Module 2', threshold: 70 },
      ],
      [
        notion({
          id: NOTION_1,
          label: 'Notion maîtrisée',
          mastery: 90,
          section_id: SECTION,
          section_anchor: 'section-a',
        }),
        notion({
          id: NOTION_2,
          label: 'Notion à consolider',
          notion_position: 2,
          mastery: 40,
          gap_nature: 'forgetting',
        }),
        notion({
          id: NOTION_3,
          label: 'Lacune effacée',
          chapter_id: CHAPTER_2,
          chapter_position: 2,
          notion_position: 1,
          mastery: 50,
          gap_nature: 'misunderstanding',
          gap_cleared_at: '2026-11-10T09:00:00Z',
        }),
        notion({
          id: NOTION_4,
          label: 'Notion inconnue',
          chapter_id: CHAPTER_2,
          chapter_position: 2,
          notion_position: 2,
          mastery: null,
          gap_nature: 'application',
        }),
      ],
      [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          from_notion_id: NOTION_1,
          to_notion_id: NOTION_2,
          kind: 'prerequisite',
        },
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          from_notion_id: NOTION_1,
          to_notion_id: NOTION_3,
          kind: 'confusion',
        },
      ],
      [
        {
          id: RESOURCE_1,
          title: 'Fiche de synthèse',
          chapter_id: CHAPTER_1,
          created_at: '2026-11-09T09:00:00Z',
        },
        {
          id: RESOURCE_2,
          title: 'Apport sans chapitre',
          chapter_id: null,
          created_at: new Date('2026-11-10T09:00:00Z'),
        },
      ],
    ]);

    const result = await getNotionGraph(context(execute), { formationId: FORMATION });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    const graph = result.value;

    expect(graph).toMatchObject({
      formationId: FORMATION,
      formationTitle: 'SAP S/4HANA Finance',
      timezone: 'Europe/Paris',
      generatedAt: NOW.toISOString(),
      stats: {
        notions: 4,
        links: 2,
        modules: 2,
        mastered: 1,
        upcoming: 1,
        openGaps: 1,
      },
    });
    expect(graph.nodes.map((node) => node.kind)).toEqual([
      'formation',
      'module',
      'module',
      'notion',
      'notion',
      'notion',
      'notion',
      'source',
      'source',
    ]);
    expect(graph.nodes.map((node) => node.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const mastered = graph.nodes.find((node) => node.id === `notion:${NOTION_1}`);
    expect(mastered).toMatchObject({
      masteryStatus: 'mastered',
      courseHref: `/formations/${FORMATION}/modules/${MODULE_1}/cours?chapitre=${CHAPTER_1}#section-a`,
      trainingHref: `/formations/${FORMATION}/quiz-global?cible=${NOTION_1}`,
      gapHref: null,
    });

    const toConsolidate = graph.nodes.find((node) => node.id === `notion:${NOTION_2}`);
    expect(toConsolidate).toMatchObject({
      masteryStatus: 'to_consolidate',
      gapNature: 'forgetting',
      courseHref: `/formations/${FORMATION}/modules/${MODULE_1}/cours`,
      trainingHref: `/formations/${FORMATION}/quiz-global?cible=${NOTION_2}`,
      gapHref: `/formations/${FORMATION}/lacunes?nature=forgetting`,
    });

    const cleared = graph.nodes.find((node) => node.id === `notion:${NOTION_3}`);
    expect(cleared).toMatchObject({
      masteryStatus: 'to_consolidate',
      gapNature: null,
      gapHref: null,
    });

    const unknown = graph.nodes.find((node) => node.id === `notion:${NOTION_4}`);
    expect(unknown).toMatchObject({
      masteryStatus: 'upcoming',
      gapNature: 'application',
      trainingHref: `/formations/${FORMATION}/modules/${MODULE_1}/exercices?notion=${NOTION_4}`,
      gapHref: `/formations/${FORMATION}/lacunes?nature=application`,
    });

    expect(graph.gaps).toEqual([
      {
        notionId: NOTION_2,
        label: 'Notion à consolider',
        mastery: 40,
        nature: 'forgetting',
        href: `/formations/${FORMATION}/lacunes?nature=forgetting`,
      },
    ]);
    expect(graph.links.filter((link) => link.kind === 'source')).toEqual([
      {
        id: `source:${RESOURCE_1}:${NOTION_1}`,
        from: `notion:${RESOURCE_1}`,
        to: `notion:${NOTION_1}`,
        kind: 'source',
      },
      {
        id: `source:${RESOURCE_1}:${NOTION_2}`,
        from: `notion:${RESOURCE_1}`,
        to: `notion:${NOTION_2}`,
        kind: 'source',
      },
    ]);
    expect(graph.links.filter((link) => link.kind === 'prerequisite')).toHaveLength(1);
    expect(graph.links.filter((link) => link.kind === 'confusion')).toHaveLength(1);
  });

  it('ET-3 — une formation sans programme reste un graphe racine valide', async () => {
    const execute = sequence([
      [{ id: FORMATION, title: 'Formation vide', timezone: 'UTC' }],
      [],
      [],
      [],
      [],
    ]);

    const result = await getNotionGraph(context(execute), { formationId: FORMATION });
    expect(result).toMatchObject({
      ok: true,
      value: {
        nodes: [{ kind: 'formation', id: `notion:${FORMATION}` }],
        links: [],
        gaps: [],
        stats: { notions: 0, links: 0, modules: 0, mastered: 0, upcoming: 0, openGaps: 0 },
      },
    });
  });

  it('refuse un appelant anonyme et une formation absente', async () => {
    const anonymous = await getNotionGraph(context(sequence([]), null), {
      formationId: FORMATION,
    });
    expect(anonymous).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });

    const missing = await getNotionGraph(context(sequence([[]])), { formationId: FORMATION });
    expect(missing).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
