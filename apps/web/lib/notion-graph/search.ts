import type { NotionGraphDto, NotionGraphNode } from '@learny/contracts';

// Search of SCR-14 (SPEC-616 BR-CAR-03, EF-3).
//
// The query is normalised once (case, diacritics and apostrophes) so « variante d'exercice »
// finds « Variante d’exercice ». Results are ordered: notions first, then modules, then sources,
// each alphabetically by label; Enter selects the first one.

export const GRAPH_SEARCH_LIMIT = 6;

/** Lowercase, accentless, straight-apostrophe text used on both sides of a comparison. */
export function normalizeGraphQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fr-FR');
}

function kindPriority(kind: NotionGraphNode['kind']): number {
  switch (kind) {
    case 'notion':
      return 0;
    case 'module':
      return 1;
    case 'source':
      return 2;
    case 'formation':
      return 3;
  }
}

/** Every node whose label contains the query, in the stable order of the suggestion list. */
export function searchGraphNodes(
  graph: Pick<NotionGraphDto, 'nodes'>,
  query: string,
): NotionGraphNode[] {
  const normalized = normalizeGraphQuery(query);
  if (normalized === '') return [];
  return graph.nodes
    .filter((node) => node.kind !== 'formation')
    .filter((node) => normalizeGraphQuery(node.label).includes(normalized))
    .sort(
      (left, right) =>
        kindPriority(left.kind) - kindPriority(right.kind) ||
        left.label.localeCompare(right.label, 'fr'),
    )
    .slice(0, GRAPH_SEARCH_LIMIT);
}

/** The node selected by Enter: the first notion, module or apport matching the query. */
export function firstGraphMatch(
  graph: Pick<NotionGraphDto, 'nodes'>,
  query: string,
): NotionGraphNode | null {
  return searchGraphNodes(graph, query)[0] ?? null;
}
