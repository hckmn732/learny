import type { NotionGraphDto, NotionGraphNode } from '@learny/contracts';

import type { GraphLayout, GraphPoint } from '../../components/notion-graph/layout';

import { firstGraphMatch } from './search';

// Pan / zoom / selection of SCR-14 (SPEC-616 ET-5, EF-2, EF-3; ADR-0036).
//
// Everything here is pure: a view is a value, a filter set is a value, a drag returns a new
// position map. The graph DTO is never mutated, so zooming, recentring or moving a node cannot
// change the persisted data (CA-2). The zoom bounds are explicit and shared by the wheel, the
// buttons and keyboard shortcuts.

export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 4;
export const SEARCH_ZOOM = 1.5;
const FIT_PADDING = 70;
/** Initial fit stays under the label threshold, so a first paint is not a wall of labels. */
const FIT_MAX_ZOOM = 1.15;

export interface GraphView {
  x: number;
  y: number;
  k: number;
}

export interface GraphViewport {
  width: number;
  height: number;
}

export interface GraphFilters {
  modules: boolean;
  upcoming: boolean;
  sources: boolean;
}

export interface FilterState {
  filters: GraphFilters;
  selectedId: string | null;
}

export const DEFAULT_FILTERS: GraphFilters = {
  modules: true,
  upcoming: true,
  sources: false,
};

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Zooms around a viewport point, keeping that point fixed on screen. */
export function zoomAt(view: GraphView, point: GraphPoint, factor: number): GraphView {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return {
    k,
    x: point.x - (point.x - view.x) * ratio,
    y: point.y - (point.y - view.y) * ratio,
  };
}

/** Pans the view by a screen delta expressed in viewBox units. */
export function panBy(view: GraphView, dx: number, dy: number): GraphView {
  return { ...view, x: view.x + dx, y: view.y + dy };
}

function clampViewport(viewport: GraphViewport): GraphViewport {
  return {
    width: Number.isFinite(viewport.width) && viewport.width > 0 ? viewport.width : 1,
    height: Number.isFinite(viewport.height) && viewport.height > 0 ? viewport.height : 1,
  };
}

/**
 * The initial view that fits the visible nodes: the mockup fit, with the explicit zoom bounds.
 * Recentring calls this same function, so it restores exactly the initial view (ET-5).
 */
export function initialView(
  layout: Pick<GraphLayout, 'nodes' | 'positions' | 'bounds'>,
  viewport: GraphViewport,
  visibleIds?: ReadonlySet<string>,
): GraphView {
  const size = clampViewport(viewport);
  const visible = layout.nodes.filter(
    (node) => visibleIds === undefined || visibleIds.has(node.id),
  );
  if (visible.length === 0) {
    return { x: size.width / 2, y: size.height / 2, k: 1 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of visible) {
    const point = layout.positions.get(node.id) ?? node;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  // A portrait canvas (mobile) fits a square cluster into a tall viewport: allow a slightly
  // larger initial zoom so the graph keeps the mockup's visual weight without showing labels.
  const maxZoom = size.height > size.width ? FIT_MAX_ZOOM + 0.2 : FIT_MAX_ZOOM;
  const k = clampZoom(
    Math.min(
      (size.width - FIT_PADDING * 2) / width,
      (size.height - FIT_PADDING * 2) / height,
      maxZoom,
    ),
  );
  return {
    k,
    x: size.width / 2 - ((minX + maxX) / 2) * k,
    y: size.height / 2 - ((minY + maxY) / 2) * k,
  };
}

/** Centres a node at the middle of the viewport, at least at `SEARCH_ZOOM`. */
export function centerOn(view: GraphView, point: GraphPoint, viewport: GraphViewport): GraphView {
  const size = clampViewport(viewport);
  const k = clampZoom(Math.max(view.k, SEARCH_ZOOM));
  return {
    k,
    x: size.width / 2 - point.x * k,
    y: size.height / 2 - point.y * k,
  };
}

/** A node drag returns a new map; the layout and the DTO keep their coordinates (CA-2). */
export function moveNode(
  positions: ReadonlyMap<string, GraphPoint>,
  id: string,
  point: GraphPoint,
): Map<string, GraphPoint> {
  const next = new Map(positions);
  next.set(id, { x: point.x, y: point.y });
  return next;
}

/** BR-CAR-03 — visibility of each node kind for the three filters of the toolbar. */
export function visibleNodeIds(
  graph: Pick<NotionGraphDto, 'nodes'>,
  filters: GraphFilters,
): Set<string> {
  const visible = new Set<string>();
  for (const node of graph.nodes) {
    if (node.kind === 'source' && !filters.sources) continue;
    if ((node.kind === 'formation' || node.kind === 'module') && !filters.modules) continue;
    if (node.kind === 'notion' && !filters.upcoming && node.masteryStatus === 'upcoming') continue;
    visible.add(node.id);
  }
  return visible;
}

export function visibleLinks(
  graph: Pick<NotionGraphDto, 'links'>,
  visibleIds: ReadonlySet<string>,
): NotionGraphDto['links'] {
  return graph.links.filter((link) => visibleIds.has(link.from) && visibleIds.has(link.to));
}

/** Toggles one filter without ever clearing the selection (EF-3, CA-2). */
export function toggleFilter(state: FilterState, key: keyof GraphFilters): FilterState {
  return {
    filters: { ...state.filters, [key]: !state.filters[key] },
    selectedId: state.selectedId,
  };
}

export interface SearchSelection {
  nodeId: string;
  view: GraphView;
}

/**
 * BR-CAR-03 / CA-2 — Enter on the search field selects the first match and centres it without
 * changing any coordinate of the graph.
 */
export function searchSelection(
  graph: Pick<NotionGraphDto, 'nodes'>,
  query: string,
  layout: Pick<GraphLayout, 'positions'>,
  viewport: GraphViewport,
): SearchSelection | null {
  const match: NotionGraphNode | null = firstGraphMatch(graph, query);
  if (match === null) return null;
  const point = layout.positions.get(match.id);
  if (point === undefined) return null;
  return { nodeId: match.id, view: centerOn({ x: 0, y: 0, k: SEARCH_ZOOM }, point, viewport) };
}

/** Converts a pointer position on the SVG into viewBox coordinates. */
export function toViewBox(
  pointer: GraphPoint,
  rect: GraphViewport,
  viewBox: GraphViewport,
): GraphPoint {
  return {
    x: (pointer.x / Math.max(1, rect.width)) * viewBox.width,
    y: (pointer.y / Math.max(1, rect.height)) * viewBox.height,
  };
}

/** Converts a viewBox point into graph coordinates under the current view. */
export function toGraphPoint(point: GraphPoint, view: GraphView): GraphPoint {
  return { x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k };
}
