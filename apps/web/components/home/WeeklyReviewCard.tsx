'use client';

import { useQuery } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useId, useState } from 'react';

import { formatWeeklyStudy } from '@learny/contracts/automatisme-9-bilan-de-la-semaine';
import { Button, EmptyState, ErrorState, SkeletonCard, SkeletonGroup, cn } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr/home';

const t = fr.home.weeklyReview;

function shortDay(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00.000Z`));
}

/**
 * EF-2 — « Bilan de la semaine » of SCR-03. The card reads the latest review of the connected
 * learner through the RLS service, keeps the real computed values and unfolds the retention, the
 * at-risk notions and the plan of the next week. The availability question opens the rhythm
 * section: the numbers are never recomputed in the browser.
 */
export function WeeklyReviewPanel() {
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ['weekly-review'],
    queryFn: () => api.meWeeklyReviewGet({ query: {} }),
    retry: false,
    refetchOnWindowFocus: true,
  });

  const section =
    'flex flex-col gap-14 rounded-24 border border-solid border-border bg-surface p-[22px_24px]';

  if (query.isPending) {
    return (
      <section data-testid="weekly-review" aria-busy="true" className={section}>
        <SkeletonGroup label={t.loading}>
          <SkeletonCard className="border-0 p-0" />
        </SkeletonGroup>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section
        data-testid="weekly-review"
        aria-labelledby="weekly-review-title"
        className={section}
      >
        <h2 id="weekly-review-title" className="m-0 text-16 font-600">
          {t.title}
        </h2>
        <ErrorState
          data-testid="weekly-review-error"
          className="px-0 py-12"
          description={t.errorDescription}
          title={t.errorTitle}
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  }

  const data = query.data;
  if (!data.available || data.review === null) {
    return (
      <section
        data-testid="weekly-review"
        aria-labelledby="weekly-review-title"
        className={section}
      >
        <h2 id="weekly-review-title" className="m-0 text-16 font-600">
          {t.title}
        </h2>
        <EmptyState compact data-testid="weekly-review-empty" title={t.empty} />
      </section>
    );
  }

  const review = data.review;

  return (
    <section data-testid="weekly-review" aria-labelledby="weekly-review-title" className={section}>
      <div className="flex flex-wrap items-baseline justify-between gap-10">
        <h2
          id="weekly-review-title"
          data-testid="weekly-review-title"
          className="m-0 text-16 font-600"
        >
          {t.title}
        </h2>
        <p className="m-0 text-12 text-ink-muted" data-testid="weekly-review-period">
          {`${review.periodLabel} · ${review.receivedLabel}`}
        </p>
      </div>

      <dl className="m-0 grid grid-cols-3 gap-10">
        <div className="flex min-w-0 flex-col gap-2 rounded-12 bg-surface-subtle px-12 py-10">
          <dd
            data-testid="weekly-review-hours"
            className="m-0 min-w-0 font-display text-22 leading-1.1 font-600 break-words [overflow-wrap:anywhere] tabular-nums"
          >
            {review.studyLabel}
          </dd>
          <dt className="text-12 text-ink-muted">{t.studyLabel}</dt>
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-12 bg-surface-subtle px-12 py-10">
          <dd
            data-testid="weekly-review-retention"
            className="m-0 min-w-0 font-display text-22 leading-1.1 font-600 break-words [overflow-wrap:anywhere] tabular-nums"
          >
            {review.retentionLabel}
          </dd>
          <dt className="text-12 text-ink-muted">{t.retentionLabel}</dt>
        </div>
        <div className="flex min-w-0 flex-col gap-2 rounded-12 bg-orange-soft px-12 py-10 text-orange-ink-strong">
          <dd
            data-testid="weekly-review-at-risk"
            className="m-0 min-w-0 font-display text-22 leading-1.1 font-600 break-words [overflow-wrap:anywhere] tabular-nums"
          >
            {String(review.atRiskCount)}
          </dd>
          <dt className="text-12">{t.atRiskLabel(review.atRiskCount)}</dt>
        </div>
      </dl>

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-testid="weekly-review-toggle"
          aria-controls={detailsId}
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          {expanded ? t.hide : t.detail}
        </Button>
      </div>

      {expanded ? (
        <div id={detailsId} data-testid="weekly-review-details" className="flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-13 font-700">{t.atRiskTitle}</h3>
            {review.atRiskNotions.length === 0 ? (
              <p className="m-0 text-13 text-ink-muted">{t.noAtRisk}</p>
            ) : (
              <ul className="m-0 flex list-none flex-wrap gap-6 p-0">
                {review.atRiskNotions.map((notion) => (
                  <li
                    key={notion.notionId}
                    className="max-w-full rounded-full bg-orange-soft px-10 py-3 text-12 font-600 break-words [overflow-wrap:anywhere] text-orange-ink-strong"
                  >
                    {notion.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <h3 className="m-0 text-13 font-700">{t.planTitle}</h3>
            {review.plan.length === 0 ? (
              <p className="m-0 text-13 text-ink-muted">{t.noPlan}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-13">
                {review.plan.map((day) => (
                  <li
                    key={day.date}
                    data-testid="weekly-review-plan-day"
                    className="flex justify-between gap-12"
                  >
                    <span>{shortDay(day.date)}</span>
                    <span className="tabular-nums text-ink-muted">
                      {formatWeeklyStudy(day.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-10 rounded-12 bg-surface-subtle px-12 py-10">
            <p className="m-0 text-13 font-600">{t.availabilityQuestion}</p>
            <NextLink
              data-testid="weekly-review-availability"
              className={cn(
                'text-13 font-700 text-ink underline decoration-1 underline-offset-4',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
              )}
              href={review.availabilityHref}
            >
              {t.availabilityLink}
            </NextLink>
          </div>
        </div>
      ) : null}
    </section>
  );
}
