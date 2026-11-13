import { CircleCheck } from 'lucide-react';
import NextLink from 'next/link';

import type { FinalReviewDto } from '@learny/contracts';
import { EmptyState } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.finalReview;

const NATURE_CLASS = {
  confusion: 'bg-orange-soft text-orange-ink',
  misunderstanding: 'bg-violet-soft text-violet-ink',
  application: 'bg-lime-soft text-lime-ink',
  forgetting: 'bg-green-soft text-green-ink',
} as const;

export interface FragileNotionsProps {
  gaps: FinalReviewDto['gaps'];
}

/**
 * Fragile notions of the final review (SPEC-617 EF-1, EF-3). Each card keeps its nature, its
 * module, its mastery and the targeted training link built server-side from the stored nature.
 */
export function FragileNotions({ gaps }: FragileNotionsProps) {
  return (
    <section
      data-testid="final-review-gaps"
      aria-labelledby="final-review-gaps-title"
      className="flex flex-col gap-12"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-8">
        <h2
          id="final-review-gaps-title"
          className="m-0 font-display text-22 font-600 tracking-heading"
        >
          {t.fragile.title}
        </h2>
        <span className="text-13 text-ink-muted">{t.fragile.description}</span>
      </div>
      {gaps.length === 0 ? (
        <div className="rounded-24 border border-solid border-border bg-surface">
          <EmptyState
            icon={CircleCheck}
            tone="lime"
            title={t.fragile.emptyTitle}
            description={t.fragile.emptyDescription}
          />
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-12 p-0">
          {gaps.map((gap) => (
            <li
              key={gap.notionId}
              data-testid="final-review-gap"
              className="flex flex-wrap items-start gap-20 rounded-24 border border-solid border-border bg-surface px-24 py-20"
            >
              <div className="flex min-w-[240px] flex-[2_1_320px] flex-col gap-8">
                <div className="flex flex-wrap items-center gap-8">
                  <span
                    className={`rounded-full px-10 py-3 text-12 font-700 ${NATURE_CLASS[gap.nature]}`}
                  >
                    {gap.natureLabel}
                  </span>
                  <span className="rounded-full bg-surface-muted px-10 py-3 text-12 font-600 text-ink-secondary">
                    {t.fragile.module(gap.modulePosition)} · {gap.moduleTitle}
                  </span>
                </div>
                <p className="m-0 text-16 font-700">{gap.label}</p>
                {gap.evidence === '' ? null : (
                  <p className="m-0 text-13 leading-1.5 text-ink-muted">{gap.evidence}</p>
                )}
              </div>
              <div className="flex min-w-[140px] flex-1 flex-col items-end gap-10">
                <span className="font-display text-20 font-600 tabular-nums">
                  {t.fragile.mastery(Math.round(gap.mastery))}
                </span>
                <NextLink
                  prefetch={false}
                  href={gap.trainingHref}
                  className="inline-flex min-h-40 items-center rounded-12 border border-solid border-border-strong bg-surface px-14 text-13 font-700 text-ink no-underline transition-[background-color] hover:bg-surface-subtle"
                >
                  {t.fragile.train}
                </NextLink>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
