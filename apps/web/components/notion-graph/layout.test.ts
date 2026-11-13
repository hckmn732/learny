import { describe, expect, it } from 'vitest';

import type { NotionGraphDto, NotionGraphNode } from '@learny/contracts';

import { LAYOUT_ITERATIONS, layoutGraph } from './layout';

function node(
  overrides: Partial<NotionGraphNode> & Pick<NotionGraphNode, 'id' | 'kind' | 'label' | 'order'>,
): NotionGraphNode {
  return {
    moduleId: null,
    modulePosition: null,
    moduleTitle: null,
    chapterPosition: null,
    notionPosition: null,
    definition: null,
    mastery: null,
    masteryStatus: null,
    gapNature: null,
    courseHref: null,
    trainingHref: null,
    gapHref: null,
    ...overrides,
  };
}

function fixture(): Pick<NotionGraphDto, 'nodes' | 'links'> {
  const nodes: NotionGraphNode[] = [
    node({ id: 'formation:1', kind: 'formation', label: 'SAP', order: 0 }),
    node({
      id: 'module:1',
      kind: 'module',
      label: 'Module 1',
      order: 1,
      moduleId: 'module:1',
      modulePosition: 1,
    }),
    node({
      id: 'module:2',
      kind: 'module',
      label: 'Module 2',
      order: 2,
      moduleId: 'module:2',
      modulePosition: 2,
    }),
    node({
      id: 'notion:1',
      kind: 'notion',
      label: 'Variante',
      order: 3,
      moduleId: 'module:1',
      modulePosition: 1,
      mastery: 60,
      masteryStatus: 'to_consolidate',
    }),
    node({
      id: 'notion:2',
      kind: 'notion',
      label: 'Société',
      order: 4,
      moduleId: 'module:1',
      modulePosition: 1,
      mastery: 90,
      masteryStatus: 'mastered',
    }),
    node({
      id: 'notion:3',
      kind: 'notion',
      label: 'Devise',
      order: 5,
      moduleId: 'module:2',
      modulePosition: 2,
      mastery: null,
      masteryStatus: 'upcoming',
    }),
    node({ id: 'source:1', kind: 'source', label: 'Guide FI', order: 6 }),
  ];
  return {
    nodes,
    links: [
      { id: 'f1', from: 'formation:1', to: 'module:1', kind: 'formation' },
      { id: 'f2', from: 'formation:1', to: 'module:2', kind: 'formation' },
      { id: 'c1', from: 'module:1', to: 'notion:1', kind: 'contains' },
      { id: 'c2', from: 'module:1', to: 'notion:2', kind: 'contains' },
      { id: 'c3', from: 'module:2', to: 'notion:3', kind: 'contains' },
      { id: 'p1', from: 'notion:2', to: 'notion:1', kind: 'prerequisite' },
      { id: 's1', from: 'source:1', to: 'notion:1', kind: 'source' },
    ],
  };
}

function denseFixture(): Pick<NotionGraphDto, 'nodes' | 'links'> {
  const nodes: NotionGraphNode[] = [
    node({ id: 'formation:1', kind: 'formation', label: 'Dense', order: 0 }),
  ];
  const links: NotionGraphDto['links'] = [];
  for (let moduleIndex = 0; moduleIndex < 8; moduleIndex += 1) {
    const moduleId = `module:${String(moduleIndex)}`;
    nodes.push(
      node({
        id: moduleId,
        kind: 'module',
        label: `Module ${String(moduleIndex)}`,
        order: nodes.length,
        moduleId,
        modulePosition: moduleIndex + 1,
      }),
    );
    links.push({ id: `f:${moduleId}`, from: 'formation:1', to: moduleId, kind: 'formation' });
    for (let notionIndex = 0; notionIndex < 12; notionIndex += 1) {
      const notionId = `notion:${String(moduleIndex)}:${String(notionIndex)}`;
      nodes.push(
        node({
          id: notionId,
          kind: 'notion',
          label: `Notion ${String(moduleIndex)}.${String(notionIndex)}`,
          order: nodes.length,
          moduleId,
          modulePosition: moduleIndex + 1,
          mastery: notionIndex * 7,
          masteryStatus: notionIndex % 3 === 0 ? 'upcoming' : 'mastered',
        }),
      );
      links.push({ id: `c:${notionId}`, from: moduleId, to: notionId, kind: 'contains' });
      if (notionIndex > 0) {
        links.push({
          id: `p:${notionId}`,
          from: `notion:${String(moduleIndex)}:${String(notionIndex - 1)}`,
          to: notionId,
          kind: 'prerequisite',
        });
      }
    }
  }
  return { nodes, links };
}

describe('[SPEC-616] disposition déterministe', () => {
  it('rend les mêmes coordonnées après 420 itérations quel que soit l’ordre des tableaux (CA-1)', () => {
    const graph = fixture();
    const first = layoutGraph(graph, 7);
    const reordered = layoutGraph(
      { nodes: [...graph.nodes].reverse(), links: [...graph.links].reverse() },
      7,
    );
    expect(first.iterations).toBe(LAYOUT_ITERATIONS);
    expect(reordered.iterations).toBe(LAYOUT_ITERATIONS);
    expect(Object.fromEntries(first.positions)).toEqual(Object.fromEntries(reordered.positions));
  });

  it('garde le nœud formation seul, sans simulation ni NaN (CL-3)', () => {
    const graph = {
      nodes: [node({ id: 'formation:1', kind: 'formation', label: 'Vide', order: 0 })],
      links: [],
    };
    const layout = layoutGraph(graph, 7);
    expect(layout.iterations).toBe(0);
    expect(layout.positions.get('formation:1')).toEqual({ x: 0, y: 0 });
    for (const position of layout.positions.values()) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }
  });

  it('stabilise un graphe dense sans NaN (CL-4)', () => {
    const layout = layoutGraph(denseFixture(), 7);
    expect(layout.nodes).toHaveLength(1 + 8 + 8 * 12);
    expect(layout.iterations).toBe(LAYOUT_ITERATIONS);
    for (const point of layout.positions.values()) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
    expect(layout.bounds.minX).toBeLessThan(layout.bounds.maxX);
    expect(layout.bounds.minY).toBeLessThan(layout.bounds.maxY);
  });

  it('donne la même disposition à deux chargements successifs (CA-1)', () => {
    expect(layoutGraph(fixture(), 7).positions).toEqual(layoutGraph(fixture(), 7).positions);
  });
});
