'use client';

import { Maximize2, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { NotionGraphColorMode, NotionGraphDto, NotionGraphLink } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import type { GraphView, GraphViewport } from '../../lib/notion-graph/pan-zoom';
import { panBy, toGraphPoint, toViewBox, zoomAt } from '../../lib/notion-graph/pan-zoom';
import { normalizeGraphQuery } from '../../lib/notion-graph/search';
import { fr } from '../../messages/fr';

import { GraphLegend } from './GraphLegend';
import type { GraphLayout, GraphPoint } from './layout';
import { GRAPH_COLORS, MASTERY_COLORS, moduleColor, nodeColor } from './palette';

const t = fr.notionGraph;

const VIEWBOX_WIDTH = 1000;
const DEFAULT_HEIGHT = 717;

const EDGE_STYLE: Record<NotionGraphLink['kind'], { stroke: string; width: number; dash: string }> =
  {
    formation: { stroke: GRAPH_COLORS.contains, width: 1, dash: '' },
    contains: { stroke: GRAPH_COLORS.contains, width: 1, dash: '' },
    prerequisite: { stroke: GRAPH_COLORS.relation, width: 1, dash: '' },
    confusion: { stroke: GRAPH_COLORS.confusion, width: 2, dash: '5 4' },
    tutor: { stroke: GRAPH_COLORS.tutor, width: 1.5, dash: '1 4' },
    source: { stroke: GRAPH_COLORS.sourceLink, width: 1, dash: '2 3' },
  };

interface DragState {
  kind: 'node' | 'pan';
  pointerId: number;
  start: GraphPoint;
  view: GraphView;
  nodeId: string | null;
  moved: boolean;
}

export interface GraphSvgProps {
  graph: NotionGraphDto;
  layout: GraphLayout;
  positions: ReadonlyMap<string, GraphPoint>;
  visibleIds: ReadonlySet<string>;
  selectedId: string | null;
  hoveredId: string | null;
  colorMode: NotionGraphColorMode;
  query: string;
  view: GraphView;
  onViewChange: (view: GraphView) => void;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onMoveNode: (id: string, point: GraphPoint) => void;
  onRecenter: () => void;
  onViewportChange?: (viewport: GraphViewport) => void;
}

/**
 * SVG canvas of SCR-14 (SPEC-616 EF-1, EF-2, ET-4, ET-5; ADR-0036). Pointer events move the view
 * or one node without React state per frame for the graph data; the SVG is a visual equivalent of
 * the textual list, so it keeps a single labelled image role and all keyboard actions live in the
 * toolbar, the list and the detail panel.
 */
export function GraphSvg({
  graph,
  layout,
  positions,
  visibleIds,
  selectedId,
  hoveredId,
  colorMode,
  query,
  view,
  onViewChange,
  onSelect,
  onHover,
  onMoveNode,
  onRecenter,
  onViewportChange,
}: GraphSvgProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const viewRef = useRef(view);
  const onViewChangeRef = useRef(onViewChange);
  const onViewportChangeRef = useRef(onViewportChange);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (element === null) return undefined;
    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return;
      const next = Math.max(320, Math.round((VIEWBOX_WIDTH * rect.height) / rect.width));
      setHeight(next);
      onViewportChangeRef.current?.({ width: VIEWBOX_WIDTH, height: next });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const point = toViewBox(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { width: rect.width, height: rect.height },
        { width: VIEWBOX_WIDTH, height },
      );
      onViewChangeRef.current(zoomAt(viewRef.current, point, Math.exp(-event.deltaY * 0.0015)));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
    };
  }, [height]);

  const box: GraphViewport = { width: VIEWBOX_WIDTH, height };

  const localPoint = (event: { clientX: number; clientY: number }): GraphPoint => {
    const svg = svgRef.current;
    if (svg === null) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return toViewBox(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      { width: rect.width, height: rect.height },
      box,
    );
  };

  const startPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      start: localPoint(event),
      view,
      nodeId: null,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startNodeDrag = (event: ReactPointerEvent<SVGGElement>, id: string) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    dragRef.current = {
      kind: 'node',
      pointerId: event.pointerId,
      start: localPoint(event),
      view,
      nodeId: id,
      moved: false,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag === null) return;
    const point = localPoint(event);
    if (drag.kind === 'pan') {
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
      onViewChange(panBy(drag.view, dx, dy));
      return;
    }
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved || drag.nodeId === null) return;
    onMoveNode(drag.nodeId, toGraphPoint(point, viewRef.current));
  };

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag === null) return;
    if (drag.kind === 'node' && !drag.moved && drag.nodeId !== null) {
      onSelect(drag.nodeId);
    }
    if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
      event.currentTarget.releasePointerCapture(drag.pointerId);
    }
  };

  const focused = hoveredId ?? selectedId;
  const neighbors = new Set<string>();
  if (focused !== null) {
    neighbors.add(focused);
    for (const link of graph.links) {
      if (link.from === focused) neighbors.add(link.to);
      if (link.to === focused) neighbors.add(link.from);
    }
  }
  const normalizedQuery = normalizeGraphQuery(query);

  const layoutById = new Map(layout.nodes.map((node) => [node.id, node]));
  const visibleNodes = graph.nodes
    .filter((node) => visibleIds.has(node.id))
    .sort(
      (left, right) =>
        (layoutById.get(left.id)?.radius ?? 0) - (layoutById.get(right.id)?.radius ?? 0),
    );

  return (
    <section
      data-testid="notion-graph"
      aria-label={t.graph.label}
      className="relative h-[540px] min-w-0 flex-[999_1_560px] overflow-hidden rounded-24 bg-ink shell:h-[594px]"
    >
      <div ref={containerRef} className="absolute inset-0 h-full w-full">
        <svg
          ref={svgRef}
          role="img"
          aria-label={t.graph.ariaLabel}
          viewBox={`0 0 ${String(VIEWBOX_WIDTH)} ${String(height)}`}
          preserveAspectRatio="xMidYMid meet"
          className="block size-full cursor-grab touch-none select-none"
          onPointerDown={startPan}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
        >
          <g
            data-testid="graph-viewport"
            data-k={view.k.toFixed(4)}
            transform={`translate(${String(view.x)} ${String(view.y)}) scale(${String(view.k)})`}
          >
            <g aria-hidden="true">
              {graph.links.map((link) => {
                if (!visibleIds.has(link.from) || !visibleIds.has(link.to)) return null;
                const from = positions.get(link.from) ?? layout.positions.get(link.from);
                const to = positions.get(link.to) ?? layout.positions.get(link.to);
                if (from === undefined || to === undefined) return null;
                const style = EDGE_STYLE[link.kind];
                const hot = focused !== null && (link.from === focused || link.to === focused);
                const stroke =
                  hot && link.kind !== 'confusion' ? GRAPH_COLORS.selected : style.stroke;
                return (
                  <line
                    key={link.id}
                    data-testid="graph-edge"
                    data-kind={link.kind}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={stroke}
                    strokeWidth={style.width / Math.max(0.6, Math.min(view.k, 2))}
                    strokeDasharray={style.dash === '' ? undefined : style.dash}
                    strokeLinecap="round"
                    opacity={focused !== null && !hot ? 0.25 : normalizedQuery === '' ? 1 : 0.35}
                  />
                );
              })}
            </g>
            <g>
              {visibleNodes.map((node) => {
                const point = positions.get(node.id) ?? layout.positions.get(node.id);
                const layoutNode = layoutById.get(node.id);
                if (point === undefined || layoutNode === undefined) return null;
                const radius = layoutNode.radius;
                const color = nodeColor(colorMode, node);
                const isSource = node.kind === 'source';
                const isSelected = node.id === selectedId;
                const near = focused === null || neighbors.has(node.id);
                const match =
                  normalizedQuery !== '' &&
                  normalizeGraphQuery(node.label).includes(normalizedQuery);
                const dim = !near || (normalizedQuery !== '' && !match);
                const faded =
                  node.kind === 'notion' &&
                  node.masteryStatus === 'upcoming' &&
                  colorMode === 'module';
                const stroke = isSelected
                  ? GRAPH_COLORS.selected
                  : node.gapNature !== null && colorMode === 'module'
                    ? GRAPH_COLORS.confusion
                    : colors.ink;
                const strokeWidth = isSelected
                  ? 3
                  : node.gapNature !== null && colorMode === 'module'
                    ? 2
                    : 1;
                const showLabel =
                  node.kind === 'formation' ||
                  node.kind === 'module' ||
                  (near && focused !== null) ||
                  match ||
                  isSelected ||
                  (view.k >= 1.6 && node.kind === 'notion') ||
                  view.k >= 1.9;
                const fontSize =
                  (node.kind === 'notion' || node.kind === 'source' ? 10 : 12) /
                  Math.max(0.8, Math.min(view.k, 1.6));
                const textFill =
                  node.kind === 'module' || node.kind === 'formation'
                    ? colors.white
                    : colors['on-dark-secondary'];
                return (
                  <g
                    key={node.id}
                    data-testid="graph-node"
                    data-node-id={node.id}
                    data-kind={node.kind}
                    data-status={node.masteryStatus ?? undefined}
                    data-selected={isSelected ? 'true' : undefined}
                    opacity={dim ? 0.18 : faded ? 0.5 : 1}
                    className="cursor-pointer"
                    onPointerDown={(event) => {
                      startNodeDrag(event, node.id);
                    }}
                    onPointerEnter={() => {
                      onHover(node.id);
                    }}
                    onPointerLeave={() => {
                      onHover(null);
                    }}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill={isSource ? colors.ink : color}
                      stroke={isSource ? color : stroke}
                      strokeWidth={isSource ? 1.5 : strokeWidth}
                    />
                    {showLabel ? (
                      <text
                        x={point.x}
                        y={point.y + radius + 12}
                        textAnchor="middle"
                        fontSize={fontSize}
                        fontWeight={node.kind === 'notion' || node.kind === 'source' ? 500 : 700}
                        fill={textFill}
                        className="pointer-events-none"
                      >
                        {node.kind === 'module' && node.modulePosition !== null
                          ? `M${String(node.modulePosition)} · ${node.moduleTitle ?? node.label}`
                          : node.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      <p className="pointer-events-none absolute top-14 left-16 m-0 text-12 text-on-dark-muted">
        {t.graph.hint}
      </p>

      <div className="absolute top-14 right-14 flex flex-col gap-6">
        <button
          type="button"
          aria-label={t.graph.zoomIn}
          data-testid="graph-zoom-in"
          onClick={() => {
            onViewChange(zoomAt(view, { x: box.width / 2, y: box.height / 2 }, 1.3));
          }}
          className="inline-flex size-36 cursor-pointer items-center justify-center rounded-10 border border-solid border-dark-600 bg-dark-800 text-18 text-white"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={t.graph.zoomOut}
          data-testid="graph-zoom-out"
          onClick={() => {
            onViewChange(zoomAt(view, { x: box.width / 2, y: box.height / 2 }, 1 / 1.3));
          }}
          className="inline-flex size-36 cursor-pointer items-center justify-center rounded-10 border border-solid border-dark-600 bg-dark-800 text-18 text-white"
        >
          <Minus aria-hidden="true" size={18} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label={t.graph.recenter}
          data-testid="graph-recenter"
          onClick={onRecenter}
          className="inline-flex size-36 cursor-pointer items-center justify-center rounded-10 border border-solid border-dark-600 bg-dark-800 text-white"
        >
          <Maximize2 aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      </div>

      <GraphLegend
        mode={colorMode}
        modules={graph.nodes.filter((node) => node.kind === 'module')}
      />

      {graph.stats.notions === 0 ? (
        <div
          data-testid="graph-empty"
          className="absolute inset-0 flex items-center justify-center px-24 text-center"
        >
          <p className="m-0 max-w-[340px] rounded-14 bg-dark-800 px-16 py-14 text-14 text-on-dark-secondary">
            {t.graph.empty}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Kept for tests of the mastery palette without importing the component internals. */
export function masteryColor(status: keyof typeof MASTERY_COLORS): string {
  return MASTERY_COLORS[status];
}

/** Kept for tests of the module palette without importing the component internals. */
export function moduleFill(position: number | null): string {
  return moduleColor(position);
}
