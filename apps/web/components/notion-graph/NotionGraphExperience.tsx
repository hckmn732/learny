'use client';

import { useCallback, useMemo, useState } from 'react';

import type { NotionGraphColorMode, NotionGraphDto, NotionGraphNode } from '@learny/contracts';
import { PageHeader, SegmentedControl } from '@learny/ui';

import {
  centerOn,
  DEFAULT_FILTERS,
  initialView,
  moveNode,
  searchSelection,
  toggleFilter,
  visibleLinks,
  visibleNodeIds,
  type GraphFilters,
  type GraphView,
  type GraphViewport,
} from '../../lib/notion-graph/pan-zoom';
import { searchGraphNodes } from '../../lib/notion-graph/search';
import { fr } from '../../messages/fr';

import { GraphDetail } from './GraphDetail';
import { GraphList } from './GraphList';
import { GraphSvg } from './GraphSvg';
import { GraphToolbar } from './GraphToolbar';
import { layoutGraph } from './layout';

const t = fr.notionGraph;

const INITIAL_VIEWPORT: GraphViewport = { width: 1000, height: 717 };

export interface NotionGraphExperienceProps {
  graph: NotionGraphDto;
}

/**
 * Client orchestration of SCR-14 (SPEC-616 EF-2 to EF-5). The graph model and the layout are
 * computed once from the server DTO; filters, colour mode, search, selection and the view stay in
 * local state. Every mutation of the view goes through the pure pan/zoom helpers, so no interaction
 * can change the data (CA-2). The layout is deterministic (CA-1) and the textual list is the
 * keyboard equivalent of the SVG (ET-5).
 */
export function NotionGraphExperience({ graph }: NotionGraphExperienceProps) {
  const layout = useMemo(() => layoutGraph(graph), [graph]);
  const [mode, setMode] = useState<NotionGraphColorMode>('module');
  const [filterState, setFilterState] = useState<{
    filters: GraphFilters;
    selectedId: string | null;
  }>({
    filters: DEFAULT_FILTERS,
    selectedId: null,
  });
  const [query, setQuery] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [positions, setPositions] = useState(() => new Map(layout.positions));
  const [viewport, setViewport] = useState<GraphViewport>(INITIAL_VIEWPORT);
  const visibleIds = useMemo(
    () => visibleNodeIds(graph, filterState.filters),
    [graph, filterState.filters],
  );
  const links = useMemo(() => visibleLinks(graph, visibleIds), [graph, visibleIds]);
  const [view, setView] = useState<GraphView>(() =>
    initialView(layout, INITIAL_VIEWPORT, visibleIds),
  );

  const onViewportChange = useCallback(
    (next: GraphViewport) => {
      setViewport((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
      setView(initialView(layout, next, visibleIds));
    },
    [layout, visibleIds],
  );

  const select = useCallback(
    (id: string, center: boolean) => {
      setFilterState((current) => ({ ...current, selectedId: id }));
      if (!center) return;
      const point = positions.get(id) ?? layout.positions.get(id);
      if (point !== undefined) setView((current) => centerOn(current, point, viewport));
    },
    [layout.positions, positions, viewport],
  );

  const results = useMemo(() => searchGraphNodes(graph, query), [graph, query]);

  const pick = useCallback(
    (node: NotionGraphNode) => {
      select(node.id, true);
      setQuery('');
    },
    [select],
  );

  const submit = useCallback(() => {
    const selection = searchSelection(graph, query, { positions }, viewport);
    if (selection === null) return;
    setFilterState((current) => ({ ...current, selectedId: selection.nodeId }));
    setView(selection.view);
    setQuery('');
  }, [graph, positions, query, viewport]);

  const toggle = useCallback(
    (key: keyof GraphFilters) => {
      const next = toggleFilter(filterState, key);
      setFilterState(next);
      setView(initialView(layout, viewport, visibleNodeIds(graph, next.filters)));
    },
    [filterState, graph, layout, viewport],
  );

  const selected = graph.nodes.find((node) => node.id === filterState.selectedId) ?? null;
  const selectedLabel = selected?.label ?? '';

  return (
    <>
      <div data-testid="notion-graph-content" className="flex flex-col gap-20">
        <PageHeader
          eyebrow={`${graph.formationTitle} · ${t.statsLine(
            graph.stats.notions,
            graph.stats.links,
            graph.stats.modules,
          )}`}
          title={t.title}
          actions={
            <div className="flex flex-wrap items-center gap-8">
              <span className="text-13 font-600 text-ink-muted">{t.colorsLabel}</span>
              <SegmentedControl
                data-testid="graph-color-modes"
                aria-label={t.colorsLabel}
                variant="solid"
                size="sm"
                options={[
                  { value: 'module', label: t.modes.module },
                  { value: 'mastery', label: t.modes.mastery },
                ]}
                value={mode}
                onValueChange={(value) => {
                  setMode(value);
                }}
              />
            </div>
          }
        />

        <GraphToolbar
          query={query}
          results={results}
          filters={filterState.filters}
          onQueryChange={setQuery}
          onSubmit={submit}
          onPick={pick}
          onToggleFilter={toggle}
        />

        <div className="flex flex-wrap items-stretch gap-20">
          <GraphSvg
            graph={{ ...graph, links }}
            layout={layout}
            positions={positions}
            visibleIds={visibleIds}
            selectedId={filterState.selectedId}
            hoveredId={hoveredId}
            colorMode={mode}
            query={query}
            view={view}
            onViewChange={setView}
            onSelect={(id) => {
              select(id, false);
            }}
            onHover={setHoveredId}
            onMoveNode={(id, point) => {
              setPositions((current) => moveNode(current, id, point));
            }}
            onRecenter={() => {
              setView(initialView(layout, viewport, visibleIds));
            }}
            onViewportChange={onViewportChange}
          />
          <GraphDetail
            graph={graph}
            selectedId={filterState.selectedId}
            onSelect={(id) => {
              select(id, true);
            }}
            onClose={() => {
              setFilterState((current) => ({ ...current, selectedId: null }));
            }}
          />
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only" data-testid="graph-announcement">
        {selected === null ? '' : t.graph.selected(selectedLabel)}
      </p>

      <GraphList
        graph={graph}
        onSelect={(id) => {
          select(id, true);
        }}
      />
    </>
  );
}
