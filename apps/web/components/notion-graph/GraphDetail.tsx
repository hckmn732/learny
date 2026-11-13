'use client';

import NextLink from 'next/link';

import type { NotionGraphDto, NotionGraphNode } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { moduleColor } from './palette';

const t = fr.notionGraph;

function notEmpty<T>(items: readonly (T | null | undefined)[]): T[] {
  return items.filter((item): item is T => item !== null && item !== undefined);
}

interface RelatedChipProps {
  node: NotionGraphNode;
  onSelect: (id: string) => void;
}

function RelatedChip({ node, onSelect }: RelatedChipProps) {
  return (
    <button
      type="button"
      data-testid="graph-related"
      onClick={() => {
        onSelect(node.id);
      }}
      className="inline-flex min-h-32 cursor-pointer items-center gap-6 rounded-full border border-solid border-border bg-surface px-10 text-13 font-600 text-ink"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-8 flex-none rounded-full"
        style={{ backgroundColor: moduleColor(node.modulePosition) }}
      />
      {node.label}
    </button>
  );
}

function Group({
  title,
  nodes,
  onSelect,
}: {
  title: string;
  nodes: readonly NotionGraphNode[];
  onSelect: (id: string) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      <h3 className="m-0 text-12 font-700 tracking-label text-ink-muted uppercase">{title}</h3>
      <div className="flex flex-wrap gap-6">
        {nodes.map((node) => (
          <RelatedChip key={node.id} node={node} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function safePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export interface GraphDetailProps {
  graph: NotionGraphDto;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Detail panel and empty state of SCR-14 (SPEC-616 BR-CAR-04, EF-3 to EF-5). Without a selection,
 * the panel teaches how to read the map and lists « À consolider ». With a selection, it groups
 * the typed links (« S'appuie sur », « Prépare », « Se confond avec », « Lien repéré par le
 * tuteur », « Dans vos apports ») and offers the course, training and gap actions. Every action is
 * a link so it works with the keyboard.
 */
export function GraphDetail({ graph, selectedId, onSelect, onClose }: GraphDetailProps) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const selected = selectedId === null ? null : (nodeById.get(selectedId) ?? null);

  if (selected === null) {
    return (
      <aside
        data-testid="graph-detail"
        aria-label={t.detail.label}
        className="flex min-w-0 flex-1 basis-[240px] flex-col gap-16"
      >
        <section className="flex flex-col gap-14 rounded-24 border border-solid border-border bg-surface p-20">
          <h2 className="m-0 text-17 font-600">{t.detail.emptyTitle}</h2>
          <p className="m-0 text-14 leading-1.55 text-ink-secondary">{t.detail.emptyBody1}</p>
          <p className="m-0 text-14 leading-1.55 text-ink-secondary">{t.detail.emptyBody2}</p>
        </section>
        <section className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface p-20">
          <h2 className="m-0 text-17 font-600">{t.detail.gapsTitle(graph.gaps.length)}</h2>
          {graph.gaps.length === 0 ? (
            <p className="m-0 text-14 text-ink-muted">{t.detail.noGaps}</p>
          ) : (
            <ul
              data-testid="graph-gap-list"
              aria-label={t.detail.gapsTitle(graph.gaps.length)}
              className="m-0 flex list-none flex-col gap-8 p-0"
            >
              {graph.gaps.map((gap) => (
                <li key={gap.notionId}>
                  <button
                    type="button"
                    data-testid="graph-gap-item"
                    onClick={() => {
                      onSelect(`notion:${gap.notionId}`);
                    }}
                    className="flex min-h-44 w-full cursor-pointer items-center gap-10 rounded-12 border border-solid border-border bg-surface px-12 text-left text-14 text-ink"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-block size-8 flex-none rounded-full bg-orange"
                    />
                    <span className="min-w-0 flex-1 font-600">{gap.label}</span>
                    <span className="text-12 font-700 text-orange-ink">
                      {String(gap.mastery)} %
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-8 text-13 text-ink-muted">
            <span className="font-700 text-ink">
              {t.detail.masteredCount(graph.stats.mastered)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t.detail.upcomingCount(graph.stats.upcoming)}</span>
          </div>
        </section>
      </aside>
    );
  }

  const relations = graph.links.filter(
    (link) => link.from === selected.id || link.to === selected.id,
  );
  const related = (id: string): NotionGraphNode | null => nodeById.get(id) ?? null;
  const other = (from: string, to: string): NotionGraphNode | null =>
    related(from === selected.id ? to : from);

  const dependsOn = notEmpty(
    relations
      .filter((link) => link.kind === 'prerequisite' && link.to === selected.id)
      .map((link) => related(link.from)),
  );
  const prepares = notEmpty(
    relations
      .filter((link) => link.kind === 'prerequisite' && link.from === selected.id)
      .map((link) => related(link.to)),
  );
  const confusion = notEmpty(
    relations.filter((link) => link.kind === 'confusion').map((link) => other(link.from, link.to)),
  );
  const tutor = notEmpty(
    relations.filter((link) => link.kind === 'tutor').map((link) => other(link.from, link.to)),
  );
  const sources = notEmpty(
    relations
      .filter((link) => link.kind === 'source' && link.to === selected.id)
      .map((link) => related(link.from)),
  );

  const moduleNotions =
    selected.kind === 'module'
      ? graph.nodes.filter((node) => node.kind === 'notion' && node.moduleId === selected.moduleId)
      : [];
  const fedNotions =
    selected.kind === 'source'
      ? notEmpty(
          graph.links
            .filter((link) => link.kind === 'source' && link.from === selected.id)
            .map((link) => related(link.to)),
        )
      : [];
  const modules = graph.nodes.filter((node) => node.kind === 'module');

  const mastery = safePercent(selected.mastery ?? 0);
  const seen = selected.mastery !== null;
  const gap = selected.gapNature !== null;
  const statusLabel =
    selected.masteryStatus === 'mastered'
      ? t.detail.status.mastered
      : selected.masteryStatus === 'to_consolidate'
        ? t.detail.status.toConsolidate
        : selected.modulePosition !== null
          ? t.detail.notSeen(selected.modulePosition)
          : t.detail.status.upcoming;
  const statusClass =
    selected.masteryStatus === 'mastered'
      ? 'text-green-ink'
      : selected.masteryStatus === 'to_consolidate'
        ? 'text-orange-ink'
        : 'text-ink-muted';
  const kindLabel =
    selected.kind === 'notion'
      ? t.detail.kind.notion(selected.modulePosition ?? 0, selected.moduleTitle ?? '')
      : selected.kind === 'module'
        ? t.detail.kind.module(selected.modulePosition ?? 0)
        : selected.kind === 'source'
          ? t.detail.kind.source
          : t.detail.kind.formation;
  const kindPillClass =
    selected.kind === 'module'
      ? 'bg-ink text-white'
      : selected.kind === 'source'
        ? 'bg-green-soft text-green-ink'
        : selected.kind === 'formation'
          ? 'bg-indigo-soft text-indigo-ink-strong'
          : 'bg-canvas text-ink-secondary';
  const description =
    selected.kind === 'notion'
      ? (selected.definition ??
        t.detail.definitionFallback(selected.modulePosition ?? 0, selected.moduleTitle ?? ''))
      : selected.kind === 'module'
        ? t.detail.moduleSummary(
            moduleNotions.length,
            moduleNotions.filter((node) => node.masteryStatus === 'mastered').length,
            moduleNotions.filter((node) => node.gapNature !== null).length,
          )
        : selected.kind === 'source'
          ? t.detail.sourceDescription
          : t.detail.formationSummary(graph.stats.notions, graph.stats.modules);
  const programmeHref = `/formations/${encodeURIComponent(graph.formationId)}/programme`;

  return (
    <aside
      data-testid="graph-detail"
      aria-label={t.detail.label}
      className="flex min-w-0 flex-1 basis-[240px] flex-col gap-16"
    >
      <section className="flex flex-col gap-14 rounded-24 border border-solid border-border bg-surface p-20">
        <div className="flex items-start justify-between gap-10">
          <div className="flex min-w-0 flex-col gap-6">
            <span
              className={`self-start rounded-full px-10 py-3 text-12 font-700 ${kindPillClass}`}
            >
              {kindLabel}
            </span>
            <h2 className="m-0 text-22 leading-1.2 font-600 font-display tracking-heading">
              {selected.label}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t.detail.close}
            data-testid="graph-detail-close"
            onClick={onClose}
            className="inline-flex size-32 flex-none cursor-pointer items-center justify-center rounded-9 border-0 bg-canvas text-18 text-ink-muted"
          >
            ×
          </button>
        </div>

        <p className="m-0 text-14 leading-1.55 text-ink-secondary">{description}</p>

        {selected.kind === 'notion' ? (
          seen ? (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between gap-8 text-13">
                <span className={`font-700 ${statusClass}`}>{statusLabel}</span>
                <span className="font-700 tabular-nums">{String(mastery)} %</span>
              </div>
              <div
                role="progressbar"
                aria-label={t.detail.masteryLabel(selected.label, String(mastery))}
                aria-valuenow={mastery}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-8 overflow-hidden rounded-4 bg-surface-muted"
              >
                <div
                  className={`h-8 rounded-4 ${gap ? 'bg-orange' : 'bg-teal'}`}
                  style={{ width: `${String(mastery)}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="m-0 rounded-12 bg-canvas px-12 py-10 text-13 text-ink-secondary">
              {statusLabel}
            </p>
          )
        ) : null}

        <Group title={t.detail.groups.dependsOn} nodes={dependsOn} onSelect={onSelect} />
        <Group title={t.detail.groups.prepares} nodes={prepares} onSelect={onSelect} />
        <Group title={t.detail.groups.confusion} nodes={confusion} onSelect={onSelect} />
        <Group title={t.detail.groups.tutor} nodes={tutor} onSelect={onSelect} />
        <Group title={t.detail.groups.sources} nodes={sources} onSelect={onSelect} />
        <Group
          title={t.detail.groups.moduleNotions}
          nodes={moduleNotions.length === 0 ? [] : moduleNotions}
          onSelect={onSelect}
        />
        <Group title={t.detail.groups.fedNotions} nodes={fedNotions} onSelect={onSelect} />
        {selected.kind === 'formation' ? (
          <Group title={t.detail.groups.formationModules} nodes={modules} onSelect={onSelect} />
        ) : null}

        <div className="mt-4 flex flex-wrap gap-8">
          {selected.kind === 'notion' && seen ? (
            <>
              {selected.courseHref !== null ? (
                <NextLink
                  data-testid="graph-course-link"
                  prefetch={false}
                  href={selected.courseHref}
                  aria-label={t.detail.openCourse(selected.label)}
                  className="inline-flex min-h-40 items-center rounded-12 bg-ink px-14 text-14 font-700 text-white no-underline"
                >
                  {t.detail.actions.course}
                </NextLink>
              ) : null}
              {selected.trainingHref !== null ? (
                <NextLink
                  data-testid="graph-train-link"
                  prefetch={false}
                  href={selected.trainingHref}
                  aria-label={t.detail.openTraining(selected.label)}
                  className="inline-flex min-h-40 items-center rounded-12 border border-solid border-border-strong bg-surface px-14 text-14 font-700 text-ink no-underline"
                >
                  {t.detail.actions.train}
                </NextLink>
              ) : null}
              {selected.gapHref !== null ? (
                <NextLink
                  data-testid="graph-gap-link"
                  prefetch={false}
                  href={selected.gapHref}
                  aria-label={t.detail.openGap(selected.label)}
                  className="inline-flex min-h-40 items-center rounded-12 bg-orange px-14 text-14 font-700 text-white no-underline"
                >
                  {t.detail.actions.gap}
                </NextLink>
              ) : null}
            </>
          ) : (
            <NextLink
              data-testid="graph-programme-link"
              prefetch={false}
              href={programmeHref}
              className="inline-flex min-h-40 items-center rounded-12 bg-ink px-14 text-14 font-700 text-white no-underline"
            >
              {t.detail.actions.programme}
            </NextLink>
          )}
        </div>
      </section>
    </aside>
  );
}
