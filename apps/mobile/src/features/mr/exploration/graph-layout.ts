// Disposition du réseau de notions (mode cerveau des maquettes CarteCerveau.dc.html).
//
// Le serveur ne fournit pas de coordonnées : elles sont calculées ici à partir des seuls nœuds,
// de leurs liens et de leur ordre stable (`order`). Aucun aléa, aucune horloge : une même
// formation se relit exactement à l'identique (BR-CAR-05) et un test peut affirmer une position.
// La simulation est courte (90 itérations) : un écran de téléphone n'a pas besoin des 420
// itérations du web pour être lisible, et le calcul reste sous la milliseconde pour un programme
// ordinaire.
import type { NotionGraphLink, NotionGraphLinkKind, NotionGraphNode } from '@learny/contracts';

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

export interface LayoutNode extends GraphPoint {
  readonly id: string;
  readonly radius: number;
}

export interface GraphLayout {
  readonly nodes: readonly LayoutNode[];
  readonly positions: ReadonlyMap<string, GraphPoint>;
  readonly width: number;
  readonly height: number;
}

/** Itérations de la simulation : assez pour séparer les nœuds, assez peu pour rester instantané. */
export const LAYOUT_ITERATIONS = 90;

/** Marge intérieure du canevas, en points. */
const PADDING = 16;
/** Longueur visée d'un lien, par famille (échelle du web ramenée au mobile). */
const LINK_LENGTH: Record<NotionGraphLinkKind, number> = {
  formation: 150,
  contains: 62,
  prerequisite: 52,
  confusion: 46,
  tutor: 80,
  source: 46,
};
const REPULSION = 520;
const SPRING = 0.02;
const GRAVITY = 0.006;
const DAMPING = 0.82;
const MIN_DISTANCE = 18;

function kindRank(kind: NotionGraphNode['kind']): number {
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

/** Ordre stable de la simulation : le même que celui du contrat, pour une carte reproductible. */
function orderedNodes(nodes: readonly NotionGraphNode[]): readonly NotionGraphNode[] {
  return nodes.slice().sort((left, right) => {
    return (
      kindRank(left.kind) - kindRank(right.kind) ||
      left.order - right.order ||
      left.label.localeCompare(right.label) ||
      left.id.localeCompare(right.id)
    );
  });
}

/** Rayon d'un nœud : les modules et la formation se lisent avant les notions. */
function radiusOf(node: NotionGraphNode, degree: number): number {
  switch (node.kind) {
    case 'formation':
      return 16;
    case 'module':
      return 12;
    case 'source':
      return 4;
    case 'notion':
      return 4 + Math.min(degree, 8) * 0.5;
  }
}

interface Vector {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Distribue les nœuds : la formation au centre, les modules sur un cercle, les notions autour de
 * leur module et les apports à l'extérieur. La simulation ne fait ensuite que détendre les liens.
 */
function seeding(
  nodes: readonly NotionGraphNode[],
  width: number,
  height: number,
): readonly Vector[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const moduleRadius = Math.min(width, height) * 0.3;
  const notionRadius = moduleRadius * 0.52;
  const modules = nodes.filter((node) => node.kind === 'module');
  const step = modules.length === 0 ? 0 : (2 * Math.PI) / modules.length;
  const moduleAngle = new Map<string, number>();
  modules.forEach((module, index) => {
    moduleAngle.set(module.moduleId ?? module.id, -Math.PI / 2 + step * index);
  });
  const notionsPerModule = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== 'notion' || node.moduleId === null) continue;
    notionsPerModule.set(node.moduleId, (notionsPerModule.get(node.moduleId) ?? 0) + 1);
  }
  const seenNotions = new Map<string, number>();
  const sources = nodes.filter((node) => node.kind === 'source');
  const sourceStep = sources.length === 0 ? 0 : (2 * Math.PI) / sources.length;
  let sourceIndex = 0;

  return nodes.map((node) => {
    if (node.kind === 'formation') return { x: centerX, y: centerY };
    if (node.kind === 'module') {
      const angle = moduleAngle.get(node.moduleId ?? node.id) ?? 0;
      return {
        x: centerX + Math.cos(angle) * moduleRadius,
        y: centerY + Math.sin(angle) * moduleRadius,
      };
    }
    if (node.kind === 'notion') {
      const moduleId = node.moduleId ?? '';
      const angle = moduleAngle.get(moduleId) ?? 0;
      const total = Math.max(1, notionsPerModule.get(moduleId) ?? 1);
      const index = seenNotions.get(moduleId) ?? 0;
      seenNotions.set(moduleId, index + 1);
      const spread = Math.min(Math.PI * 0.8, total * 0.34);
      const offset = total <= 1 ? 0 : -spread / 2 + (spread * index) / (total - 1);
      return {
        x: centerX + Math.cos(angle + offset) * notionRadius,
        y: centerY + Math.sin(angle + offset) * notionRadius,
      };
    }
    const angle = -Math.PI / 2 + sourceStep * sourceIndex;
    sourceIndex += 1;
    return {
      x: centerX + Math.cos(angle) * (moduleRadius + notionRadius * 0.6),
      y: centerY + Math.sin(angle) * (moduleRadius + notionRadius * 0.6),
    };
  });
}

/**
 * Calcule la disposition d'un graphe dans un canevas `width × height`. Les positions tiennent
 * dans `[PADDING, largeur - PADDING] × [PADDING, hauteur - PADDING]` : rien ne sort du canevas,
 * même quand la simulation pousse un nœud vers un bord.
 */
export function layoutGraph(
  graph: Pick<NotionGraphDtoLike, 'nodes' | 'links'>,
  width: number,
  height: number,
  iterations: number = LAYOUT_ITERATIONS,
): GraphLayout {
  const nodes = orderedNodes(graph.nodes);
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const degree = new Map<string, number>();
  for (const link of graph.links) {
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
  }

  const positions: Vector[] = seeding(nodes, width, height).map((point) => ({ ...point }));
  const velocities: Vector[] = nodes.map(() => ({ x: 0, y: 0 }));
  const center = { x: width / 2, y: height / 2 };

  for (let step = 0; step < iterations; step += 1) {
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const a = positions[left];
        const b = positions[right];
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(MIN_DISTANCE, Math.hypot(dx, dy));
        const force = REPULSION / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        const velocityA = velocities[left];
        const velocityB = velocities[right];
        if (velocityA === undefined || velocityB === undefined) continue;
        velocityA.x -= fx;
        velocityA.y -= fy;
        velocityB.x += fx;
        velocityB.y += fy;
      }
    }

    for (const link of graph.links) {
      const fromIndex = indexById.get(link.from);
      const toIndex = indexById.get(link.to);
      if (fromIndex === undefined || toIndex === undefined) continue;
      const a = positions[fromIndex];
      const b = positions[toIndex];
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(MIN_DISTANCE, Math.hypot(dx, dy));
      const correction = (distance - LINK_LENGTH[link.kind]) * SPRING;
      const fx = (dx / distance) * correction;
      const fy = (dy / distance) * correction;
      const velocityA = velocities[fromIndex];
      const velocityB = velocities[toIndex];
      if (velocityA === undefined || velocityB === undefined) continue;
      velocityA.x += fx;
      velocityA.y += fy;
      velocityB.x -= fx;
      velocityB.y -= fy;
    }

    for (let index = 0; index < positions.length; index += 1) {
      const point = positions[index];
      const velocity = velocities[index];
      if (point === undefined || velocity === undefined) continue;
      velocity.x += (center.x - point.x) * GRAVITY;
      velocity.y += (center.y - point.y) * GRAVITY;
      velocity.x *= DAMPING;
      velocity.y *= DAMPING;
      point.x = clamp(point.x + velocity.x, PADDING, width - PADDING);
      point.y = clamp(point.y + velocity.y, PADDING, height - PADDING);
    }
  }

  const laidOut: LayoutNode[] = nodes.map((node, index) => {
    const point = positions[index] ?? { x: center.x, y: center.y };
    return {
      id: node.id,
      x: Math.round(point.x),
      y: Math.round(point.y),
      radius: radiusOf(node, degree.get(node.id) ?? 0),
    };
  });
  return {
    nodes: laidOut,
    positions: new Map(laidOut.map((node) => [node.id, { x: node.x, y: node.y }])),
    width,
    height,
  };
}

/** Le strict nécessaire du DTO : la disposition ne lit que les nœuds et les liens. */
interface NotionGraphDtoLike {
  readonly nodes: readonly NotionGraphNode[];
  readonly links: readonly NotionGraphLink[];
}