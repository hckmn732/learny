'use client';

import type { NotionGraphDto, NotionGraphLinkKind } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.notionGraph;

function relationLabel(kind: NotionGraphLinkKind): string {
  switch (kind) {
    case 'prerequisite':
      return 'Prérequis';
    case 'confusion':
      return t.legend.confusion;
    case 'tutor':
      return t.legend.tutor;
    case 'source':
      return t.detail.groups.sources;
    case 'formation':
    case 'contains':
      return kind;
  }
}

export interface GraphListProps {
  graph: NotionGraphDto;
  onSelect: (id: string) => void;
}

/**
 * Textual equivalent of the graph (SPEC-616 ET-5, CA-3). The list is visually hidden until it
 * receives focus, so it never competes with the mockup, yet every node and every typed relation is
 * reachable with Tab and Enter. The button labels carry the kind and the relation count, never a
 * colour (WCAG 1.4.1).
 */
export function GraphList({ graph, onSelect }: GraphListProps) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const ordered = [...graph.nodes].sort((left, right) => left.order - right.order);
  const relations = graph.links.filter(
    (link) => link.kind !== 'formation' && link.kind !== 'contains',
  );

  return (
    <section
      data-testid="graph-list"
      aria-label={t.list.title}
      className="mt-20 rounded-18 border border-solid border-border bg-surface p-16"
    >
      <h2 className="m-0 rounded-9 px-8 py-6 text-14 font-600 text-ink">{t.list.title}</h2>
      <p className="mx-8 mt-8 mb-12 text-13 text-ink-muted">{t.list.description}</p>
      <ul aria-label={t.list.label} className="m-0 flex list-none flex-col gap-8 p-0">
        {ordered.map((node) => {
          const nodeRelations = relations.filter(
            (link) => link.from === node.id || link.to === node.id,
          );
          return (
            <li key={node.id} className="flex flex-col gap-4">
              <button
                type="button"
                data-testid="graph-list-node"
                onClick={() => {
                  onSelect(node.id);
                }}
                className="flex min-h-36 w-full cursor-pointer items-center gap-8 rounded-9 border border-solid border-border bg-canvas px-10 text-left text-14 text-ink"
              >
                <span className="min-w-0 flex-1">{node.label}</span>
                <span className="text-12 text-ink-muted">
                  {node.kind === 'notion'
                    ? 'Notion'
                    : node.kind === 'module'
                      ? 'Module'
                      : node.kind === 'source'
                        ? 'Apport'
                        : 'Formation'}
                </span>
                <span className="text-12 text-ink-muted">
                  {nodeRelations.length === 0
                    ? t.list.noRelations
                    : t.list.relations(nodeRelations.length)}
                </span>
              </button>
              {nodeRelations.length === 0 ? null : (
                <ul className="m-0 ml-16 flex list-none flex-col gap-2 p-0">
                  {nodeRelations.map((link) => {
                    const other = nodeById.get(link.from === node.id ? link.to : link.from);
                    const label = relationLabel(link.kind);
                    const otherLabel =
                      other === undefined
                        ? link.from === node.id
                          ? link.to
                          : link.from
                        : other.label;
                    return (
                      <li
                        key={link.id}
                        data-testid="graph-list-relation"
                        className="text-12 text-ink-muted"
                      >
                        {label} : {otherLabel}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
