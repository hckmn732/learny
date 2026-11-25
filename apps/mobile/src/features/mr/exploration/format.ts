// Présentation des écrans d'exploration : états de maîtrise, couleurs et relations.
//
// Ces fonctions sont pures (mêmes entrées, mêmes sorties) pour que les écrans restent déclaratifs
// et que la carte se relise à l'identique d'une ouverture à l'autre (BR-CAR-05). Aucune couleur
// littérale : les valeurs viennent de `src/theme`, lui-même construit sur les jetons du design.
import type {
  GapNature,
  NotionGraphLink,
  NotionGraphNode,
} from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../../theme';
import type { ChipTone } from '../../../ui/Chip';

const t = fr.mr.exploration.carte;

/** Les quatre états de la légende de la maquette Carte.dc.html. */
export type NotionStatus = 'mastered' | 'inProgress' | 'fragile' | 'upcoming';

/** État d'un nœud : une lacune ouverte prime sur la maîtrise (SPEC-616 `masteryStatus`). */
export function statusOfNode(node: NotionGraphNode): NotionStatus {
  if (node.gapNature !== null) return 'fragile';
  if (node.masteryStatus === 'mastered') return 'mastered';
  if (node.masteryStatus === 'to_consolidate') return 'inProgress';
  return 'upcoming';
}

/** Libellé de la légende pour un état. */
export function statusLabel(status: NotionStatus): string {
  switch (status) {
    case 'mastered':
      return t.legend.mastered;
    case 'inProgress':
      return t.legend.inProgress;
    case 'fragile':
      return t.legend.fragile;
    case 'upcoming':
      return t.legend.upcoming;
  }
}

/** Couleur d'une case ou d'un nœud, reprise de la légende des maquettes. */
export function statusColor(status: NotionStatus): string {
  switch (status) {
    case 'mastered':
      return theme.colors.green;
    case 'inProgress':
      return theme.colors.lime;
    case 'fragile':
      return theme.colors.orange;
    case 'upcoming':
      return theme.colors.borderStrong;
  }
}

/** Couleur d'un lien typé (BR-CAR-01) : la confusion se distingue au premier regard. */
export function linkColor(kind: NotionGraphLink['kind']): string {
  switch (kind) {
    case 'confusion':
      return theme.colors.orange;
    case 'prerequisite':
      return theme.colors.lime;
    case 'tutor':
      return theme.colors.indigo;
    case 'source':
      return theme.colors.handle;
    case 'contains':
      return theme.colors.borderStrong;
    case 'formation':
      return theme.colors.inkMuted;
  }
}

/** Ton de puce d'une nature de lacune (cartes de l'écran Lacunes). */
export function chipToneOfNature(nature: GapNature): ChipTone {
  switch (nature) {
    case 'confusion':
      return 'orange';
    case 'misunderstanding':
      return 'indigo';
    case 'application':
      return 'green';
    case 'forgetting':
      return 'neutral';
  }
}

/** Libellé d'une nature de lacune, celui des filtres du web (SPEC-615 EF-2). */
export function natureLabel(nature: GapNature): string {
  switch (nature) {
    case 'forgetting':
      return fr.gaps.filters.forgetting;
    case 'confusion':
      return fr.gaps.filters.confusion;
    case 'misunderstanding':
      return fr.gaps.filters.misunderstanding;
    case 'application':
      return fr.gaps.filters.application;
  }
}

/** Une notion rattachée à son module, avec le score de la maquette Carte.dc.html. */
export interface ModuleGroup {
  readonly module: NotionGraphNode;
  readonly notions: readonly NotionGraphNode[];
  readonly mastered: number;
}

function moduleOrder(left: NotionGraphNode, right: NotionGraphNode): number {
  return (left.modulePosition ?? 0) - (right.modulePosition ?? 0) || left.order - right.order;
}

/** Modules de la formation et leurs notions, dans l'ordre stable du contrat (`order`). */
export function moduleGroupsOf(nodes: readonly NotionGraphNode[]): readonly ModuleGroup[] {
  const modules = nodes
    .filter((node) => node.kind === 'module')
    .slice()
    .sort(moduleOrder);
  return modules.map((module) => {
    const notions = nodes
      .filter((node) => node.kind === 'notion' && node.moduleId === module.moduleId)
      .slice()
      .sort((left, right) => left.order - right.order);
    const mastered = notions.filter((node) => statusOfNode(node) === 'mastered').length;
    return { module, notions, mastered };
  });
}

/** Une relation telle que la liste accessible l'annonce : orientation du contrat conservée. */
export interface NotionRelation {
  readonly id: string;
  readonly kind: NotionGraphLink['kind'];
  readonly from: NotionGraphNode;
  readonly to: NotionGraphNode;
}

/** Relations qui touchent `nodeId`, dans l'ordre déterministe des liens du contrat. */
export function relationsOf(
  nodeId: string,
  nodes: readonly NotionGraphNode[],
  links: readonly NotionGraphLink[],
): readonly NotionRelation[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const relations: NotionRelation[] = [];
  for (const link of links) {
    if (link.from !== nodeId && link.to !== nodeId) continue;
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (from === undefined || to === undefined) continue;
    relations.push({ id: link.id, kind: link.kind, from, to });
  }
  return relations;
}

/** Phrase d'une relation : « prépare », « se confond avec »… (BR-CAR-01). */
export function relationText(relation: NotionRelation): string {
  return t.brain.relation(
    relation.from.label,
    t.brain.relationKinds[relation.kind],
    relation.to.label,
  );
}

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

/** Identifiant de formation exploitable par `notion-graph` (`format: uuid` du contrat). */
export function isFormationId(value: string | null): value is string {
  return value !== null && UUID_PATTERN.test(value);
}