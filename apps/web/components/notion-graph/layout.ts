import type { NotionGraphDto, NotionGraphLinkKind } from '@learny/contracts';

// Deterministic force layout of SCR-14 (SPEC-616 ET-4, BR-CAR-05; ADR-0036).
//
// The simulation lives in a pure function: same graph → same coordinates, whatever the order of
// the arrays in the API response. Nodes are sorted by their stable `order` (then id) before any
// draw, module anchors start on a circle, then 420 iterations of repulsion, springs and gravity
// settle the graph. No dependency, no clock, no `Math.random`: two loads of the same formation
// produce exactly the same view (CA-1).

export const LAYOUT_ITERATIONS = 420;
export const DEFAULT_LAYOUT_SEED = 7;

export interface GraphPoint {
  x: number;
  y: number;
}

export interface LayoutNode extends GraphPoint {
  id: string;
  kind: NotionGraphDto['nodes'][number]['kind'];
  label: string;
  radius: number;
  degree: number;
}

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  positions: ReadonlyMap<string, GraphPoint>;
  bounds: LayoutBounds;
  /** Iterations actually run; 420 for every non-empty graph. */
  iterations: number;
}

const LINK_LENGTH: Record<NotionGraphLinkKind, number> = {
  formation: 190,
  contains: 85,
  prerequisite: 70,
  confusion: 60,
  tutor: 110,
  source: 60,
};

const LINK_STRENGTH: Record<NotionGraphLinkKind, number> = {
  formation: 0.04,
  contains: 0.03,
  prerequisite: 0.05,
  confusion: 0.05,
  tutor: 0.02,
  source: 0.04,
};

const RELATION_KINDS = new Set<NotionGraphLinkKind>(['prerequisite', 'confusion', 'tutor']);
const MODULE_ANCHOR_RADIUS = 230;
const NOTION_ANCHOR_RADIUS = 300;

function kindRank(kind: LayoutNode['kind']): number {
  switch (kind) {
    case 'formation':
      return 0;
    case 'module':
      return 1;
    case 'notion':
      return 2;
    case 'source':
      return 3;
  }
}

/** Local Lehmer generator: identical draws on every engine and every load. */
function createRandom(seed: number): () => number {
  let state = Math.trunc(seed) % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** Sorts nodes by their stable layout order; the id breaks an accidental tie. */
export function orderedNodes(graph: Pick<NotionGraphDto, 'nodes'>): NotionGraphDto['nodes'] {
  return [...graph.nodes].sort(
    (left, right) =>
      kindRank(left.kind) - kindRank(right.kind) ||
      left.order - right.order ||
      left.id.localeCompare(right.id),
  );
}

interface SimulationNode extends GraphPoint {
  id: string;
  kind: LayoutNode['kind'];
  label: string;
  radius: number;
  degree: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

function radiusFor(kind: LayoutNode['kind'], degree: number): number {
  if (kind === 'formation') return 13;
  if (kind === 'module') return 9;
  if (kind === 'source') return 4;
  return 4 + Math.min(degree, 8) * 0.55;
}

/**
 * Lays out a notion graph. The `seed` is fixed by the caller (default 7, the mockup value) and the
 * iteration count is the 420 of ADR-0036. An empty formation keeps its single root node at the
 * centre: the simulation is skipped rather than left unstable (CL-3).
 */
export function layoutGraph(
  graph: Pick<NotionGraphDto, 'nodes' | 'links'>,
  seed: number = DEFAULT_LAYOUT_SEED,
): GraphLayout {
  const ordered = orderedNodes(graph);
  const degree = new Map<string, number>();
  for (const link of graph.links) {
    if (!RELATION_KINDS.has(link.kind) && link.kind !== 'source') continue;
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
  }

  const random = createRandom(seed);
  const modules = ordered.filter((node) => node.kind === 'module');
  const moduleAnchors = new Map<string, GraphPoint>();
  modules.forEach((module, index) => {
    const angle = (index / modules.length) * Math.PI * 2 - Math.PI / 2;
    moduleAnchors.set(module.id, {
      x: Math.cos(angle) * MODULE_ANCHOR_RADIUS,
      y: Math.sin(angle) * MODULE_ANCHOR_RADIUS,
    });
  });

  const nodes: SimulationNode[] = ordered.map((node) => {
    const links = degree.get(node.id) ?? 0;
    let x = 0;
    let y = 0;
    if (node.kind === 'module') {
      const anchor = moduleAnchors.get(node.id) ?? { x: 0, y: 0 };
      x = anchor.x;
      y = anchor.y;
    } else if (node.kind === 'notion') {
      const anchor =
        node.moduleId === null
          ? { x: 0, y: 0 }
          : (moduleAnchors.get(node.moduleId) ?? { x: 0, y: 0 });
      const angle = random() * Math.PI * 2;
      const radius = 50 + random() * 70;
      x = anchor.x * (NOTION_ANCHOR_RADIUS / MODULE_ANCHOR_RADIUS) + Math.cos(angle) * radius;
      y = anchor.y * (NOTION_ANCHOR_RADIUS / MODULE_ANCHOR_RADIUS) + Math.sin(angle) * radius;
    } else if (node.kind === 'source') {
      x = (random() - 0.5) * 300;
      y = (random() - 0.5) * 300;
    }
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      radius: radiusFor(node.kind, links),
      degree: links,
      x,
      y,
      vx: 0,
      vy: 0,
      ax: 0,
      ay: 0,
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links = graph.links
    .map((link) => ({ ...link }))
    .filter((link) => byId.has(link.from) && byId.has(link.to))
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.id.localeCompare(right.id),
    );

  let iterations = 0;
  if (nodes.length > 1) {
    for (let iteration = 0; iteration < LAYOUT_ITERATIONS; iteration += 1) {
      iterations += 1;
      const alpha = Math.max(0.02, 1 - iteration / 380);
      for (let left = 0; left < nodes.length; left += 1) {
        for (let right = left + 1; right < nodes.length; right += 1) {
          const a = nodes[left];
          const b = nodes[right];
          if (a === undefined || b === undefined) continue;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let squared = dx * dx + dy * dy;
          if (squared < 1) {
            dx = random() - 0.5;
            dy = random() - 0.5;
            squared = 1;
          }
          const force = (2600 / squared) * alpha;
          const distance = Math.sqrt(squared);
          a.vx -= (dx / distance) * force;
          a.vy -= (dy / distance) * force;
          b.vx += (dx / distance) * force;
          b.vy += (dy / distance) * force;
        }
      }
      for (const link of links) {
        const a = byId.get(link.from);
        const b = byId.get(link.to);
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (distance - LINK_LENGTH[link.kind]) * LINK_STRENGTH[link.kind] * alpha;
        a.vx += (dx / distance) * force;
        a.vy += (dy / distance) * force;
        b.vx -= (dx / distance) * force;
        b.vy -= (dy / distance) * force;
      }
      for (const node of nodes) {
        node.vx -= node.x * 0.004 * alpha;
        node.vy -= node.y * 0.004 * alpha;
        if (node.kind === 'formation') {
          node.vx = 0;
          node.vy = 0;
          node.x = 0;
          node.y = 0;
          continue;
        }
        node.x += Math.max(-30, Math.min(30, node.vx));
        node.y += Math.max(-30, Math.min(30, node.vy));
        node.vx *= 0.55;
        node.vy *= 0.55;
      }
    }
  }

  // A finite coordinate is a contract of the layout (CL-3, CL-4). A NaN would poison every
  // transform of the SVG; fall back to the centre instead.
  for (const node of nodes) {
    if (!Number.isFinite(node.x)) node.x = 0;
    if (!Number.isFinite(node.y)) node.y = 0;
    if (!Number.isFinite(node.vx)) node.vx = 0;
    if (!Number.isFinite(node.vy)) node.vy = 0;
    node.ax = 0;
    node.ay = 0;
  }

  const bounds = {
    minX: nodes.length === 0 ? 0 : Math.min(...nodes.map((node) => node.x)),
    minY: nodes.length === 0 ? 0 : Math.min(...nodes.map((node) => node.y)),
    maxX: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.x)),
    maxY: nodes.length === 0 ? 0 : Math.max(...nodes.map((node) => node.y)),
  };

  const positions = new Map(
    nodes.map((node) => [node.id, { x: Number(node.x.toFixed(6)), y: Number(node.y.toFixed(6)) }]),
  );
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.label,
      radius: node.radius,
      degree: node.degree,
      x: node.x,
      y: node.y,
    })),
    positions,
    bounds,
    iterations,
  };
}
