import NextLink from 'next/link';

import type { FinalReviewDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.finalReview;

const DOT_CLASS = {
  mastered: 'bg-green',
  fragile: 'bg-orange',
  upcoming: 'bg-border-strong',
} as const;

const CHIP_CLASS = {
  mastered: 'border-green/40 bg-green-soft text-green-ink',
  fragile: 'border-orange/40 bg-orange-soft text-orange-ink',
  upcoming: 'border-border bg-surface-subtle text-ink-muted',
} as const;

type NotionStatus = keyof typeof DOT_CLASS;

function statusOf(
  notion: FinalReviewDto['modules'][number]['notions'][number],
  threshold: number,
): NotionStatus {
  if (notion.gapNature !== null) return 'fragile';
  if (notion.mastery !== null && notion.mastery >= threshold) return 'mastered';
  return 'upcoming';
}

export interface NotionMapProps {
  modules: FinalReviewDto['modules'];
  mapHref: string;
}

/**
 * Notion map frozen at the completion instant (SPEC-617 EF-1, CA-5). The graphical map of SCR-14
 * stays one click away; here a compact per-module grid keeps every label readable, colour is
 * doubled by a textual status and the legend never relies on colour alone.
 */
export function NotionMap({ modules, mapHref }: NotionMapProps) {
  const hasNotion = modules.some((module) => module.notions.length > 0);
  return (
    <section
      data-testid="final-review-map"
      aria-labelledby="final-review-map-title"
      className="flex flex-col gap-14 rounded-24 border border-solid border-border bg-surface px-24 py-22"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-10">
        <div className="flex flex-col gap-4">
          <h2
            id="final-review-map-title"
            className="m-0 font-display text-22 font-600 tracking-heading"
          >
            {t.map.title}
          </h2>
          <p className="m-0 text-13 leading-1.5 text-ink-muted">{t.map.description}</p>
        </div>
        <NextLink
          prefetch={false}
          href={mapHref}
          className="inline-flex min-h-40 items-center rounded-12 border border-solid border-border-strong bg-surface px-14 text-13 font-700 text-ink no-underline hover:bg-surface-subtle"
        >
          {t.openMap}
        </NextLink>
      </div>
      {hasNotion ? (
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
          {modules.map((module) => (
            <div
              key={module.moduleId}
              data-testid="final-review-map-module"
              className="flex min-w-0 flex-col gap-8 rounded-16 bg-surface-subtle px-14 py-12"
            >
              <p className="m-0 text-12 font-700 tracking-kicker text-ink-muted uppercase">
                {t.map.module(module.position)} · {module.title}
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-6 p-0" aria-label={module.title}>
                {module.notions.map((notion) => {
                  const status = statusOf(notion, module.threshold);
                  return (
                    <li key={notion.notionId}>
                      <span
                        data-testid="final-review-map-notion"
                        data-status={status}
                        title={`${notion.label} · ${
                          notion.mastery === null ? '—' : `${String(Math.round(notion.mastery))} %`
                        }`}
                        className={`inline-flex items-center gap-6 rounded-full border border-solid px-8 py-3 text-12 font-600 ${CHIP_CLASS[status]}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-6 shrink-0 rounded-full ${DOT_CLASS[status]}`}
                        />
                        {notion.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-14 text-ink-muted">{t.map.empty}</p>
      )}
      <ul className="m-0 flex list-none flex-wrap gap-16 p-0 text-12 text-ink-muted">
        <li className="flex items-center gap-6">
          <span aria-hidden="true" className="size-8 rounded-full bg-green" />
          {t.map.masteredLegend}
        </li>
        <li className="flex items-center gap-6">
          <span aria-hidden="true" className="size-8 rounded-full bg-orange" />
          {t.map.fragileLegend}
        </li>
        <li className="flex items-center gap-6">
          <span aria-hidden="true" className="size-8 rounded-full bg-border-strong" />
          {t.map.upcomingLegend}
        </li>
      </ul>
    </section>
  );
}
