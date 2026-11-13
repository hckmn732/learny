import { describe, expect, it } from 'vitest';

import type { NotionGraphDto, NotionGraphNode } from '@learny/contracts';

import { layoutGraph } from '../../components/notion-graph/layout';

import {
  centerOn,
  clampZoom,
  DEFAULT_FILTERS,
  initialView,
  MAX_ZOOM,
  MIN_ZOOM,
  moveNode,
  searchSelection,
  toggleFilter,
  visibleNodeIds,
  zoomAt,
} from './pan-zoom';

const VIEWPORT = { width: 1000, height: 717 };

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

function graph(): Pick<NotionGraphDto, 'nodes' | 'links'> {
  return {
    nodes: [
      node({ id: 'formation:1', kind: 'formation', label: 'SAP', order: 0 }),
      node({
        id: 'module:1',
        kind: 'module',
        label: 'Module 1',
        order: 1,
        moduleId: 'module:1',
        modulePosition: 1,
        moduleTitle: 'Structure',
      }),
      node({
        id: 'notion:1',
        kind: 'notion',
        label: 'Variante d’exercice',
        order: 2,
        moduleId: 'module:1',
        modulePosition: 1,
        mastery: 60,
        masteryStatus: 'to_consolidate',
      }),
      node({
        id: 'notion:2',
        kind: 'notion',
        label: 'Devise',
        order: 3,
        moduleId: 'module:1',
        modulePosition: 1,
        mastery: null,
        masteryStatus: 'upcoming',
      }),
      node({ id: 'source:1', kind: 'source', label: 'Guide FI', order: 4 }),
    ],
    links: [
      { id: 'f', from: 'formation:1', to: 'module:1', kind: 'formation' },
      { id: 'c1', from: 'module:1', to: 'notion:1', kind: 'contains' },
      { id: 'c2', from: 'module:1', to: 'notion:2', kind: 'contains' },
    ],
  };
}

describe('[SPEC-616] pan, zoom, recherche et filtres', () => {
  it('borne le zoom entre 0,35 et 4 (EF-2, ET-5)', () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, { x: 500, y: 358 }, 100).k).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, { x: 500, y: 358 }, 0.001).k).toBe(MIN_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, { x: 500, y: 358 }, 0.001).x).toBeGreaterThan(0);
  });

  it('recentre exactement la vue initiale (CA-2)', () => {
    const layout = layoutGraph(graph(), 7);
    const first = initialView(layout, VIEWPORT);
    const moved = { x: first.x + 120, y: first.y - 80, k: 2.4 };
    const recentered = initialView(layout, VIEWPORT);
    expect(recentered).toEqual(first);
    expect(recentered).not.toEqual(moved);
  });

  it('déplace un nœud sans modifier les données du graphe (CA-2)', () => {
    const layout = layoutGraph(graph(), 7);
    const original = layout.positions.get('notion:1');
    const moved = moveNode(layout.positions, 'notion:1', { x: 12, y: 34 });
    expect(moved.get('notion:1')).toEqual({ x: 12, y: 34 });
    expect(layout.positions.get('notion:1')).toEqual(original);
  });

  it('sélectionne et centre la première notion sur Entrée (CA-2)', () => {
    const layout = layoutGraph(graph(), 7);
    const selection = searchSelection(graph(), 'variante d’exercice', layout, VIEWPORT);
    expect(selection?.nodeId).toBe('notion:1');
    if (selection === null) return;
    expect(selection.view.k).toBeGreaterThanOrEqual(1.5);
    const point = layout.positions.get('notion:1');
    if (point === undefined) throw new Error('position absente');
    expect(selection.view.x).toBeCloseTo(VIEWPORT.width / 2 - point.x * selection.view.k, 6);
    expect(selection.view.y).toBeCloseTo(VIEWPORT.height / 2 - point.y * selection.view.k, 6);
    expect(searchSelection(graph(), 'inexistante', layout, VIEWPORT)).toBeNull();
  });

  it('centre un nœud sans changer les autres positions', () => {
    const view = centerOn({ x: 0, y: 0, k: 1 }, { x: 100, y: 50 }, VIEWPORT);
    expect(view.k).toBe(1.5);
    expect(view.x).toBe(VIEWPORT.width / 2 - 100 * 1.5);
    expect(view.y).toBe(VIEWPORT.height / 2 - 50 * 1.5);
  });

  it('filtre les notions à venir et les apports sans perdre la sélection (EF-3, CA-2)', () => {
    const source = graph();
    const initial = visibleNodeIds(source, DEFAULT_FILTERS);
    expect(initial.has('notion:2')).toBe(true);
    expect(initial.has('source:1')).toBe(false);

    const withoutUpcoming = visibleNodeIds(source, { ...DEFAULT_FILTERS, upcoming: false });
    expect(withoutUpcoming.has('notion:2')).toBe(false);
    expect(withoutUpcoming.has('notion:1')).toBe(true);

    const withSources = visibleNodeIds(source, { ...DEFAULT_FILTERS, sources: true });
    expect(withSources.has('source:1')).toBe(true);

    const state = toggleFilter({ filters: DEFAULT_FILTERS, selectedId: 'notion:1' }, 'upcoming');
    expect(state.filters.upcoming).toBe(false);
    expect(state.selectedId).toBe('notion:1');
  });

  it('ne modifie jamais le graphe lors des interactions de vue', () => {
    const source = graph();
    const snapshot = structuredClone(source);
    const layout = layoutGraph(source, 7);
    initialView(layout, VIEWPORT);
    searchSelection(source, 'variante', layout, VIEWPORT);
    moveNode(layout.positions, 'notion:1', { x: 1, y: 2 });
    expect(source).toEqual(snapshot);
  });
});
