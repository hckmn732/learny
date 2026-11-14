import type { FinalReviewDto } from '@learny/contracts';
import { shortCivilDay } from '@learny/services/home/derive';

import { fr } from '../../messages/fr';

const t = fr.finalReview.milestones;

/**
 * SCR-16 — sober milestone list of the final review (SPEC-723 EF-3, BR-GAM-03, ADR-0321).
 *
 * Every row shows only the achievement and its local date: no ranking, no comparison, no speed.
 * The empty state is explicit so a learner without a milestone never sees a fabricated one.
 */
export function MilestoneList({
  milestones,
  timezone,
}: Readonly<{ milestones: FinalReviewDto['milestones']; timezone: string }>) {
  return (
    <section
      data-testid="milestone-list"
      aria-labelledby="milestone-list-title"
      className="flex flex-col gap-12 rounded-24 border border-solid border-border bg-surface px-24 py-22"
    >
      <div className="flex flex-col gap-4">
        <h2
          id="milestone-list-title"
          className="m-0 font-display text-22 font-600 tracking-heading"
        >
          {t.title}
        </h2>
        <p className="m-0 text-13 leading-1.5 text-ink-muted">{t.description}</p>
      </div>
      {milestones.length === 0 ? (
        <p data-testid="milestone-empty" className="m-0 text-14 text-ink-muted">
          {t.empty}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-8 p-0">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              data-testid="milestone-item"
              data-kind={milestone.kind}
              className="flex flex-wrap items-baseline justify-between gap-8 rounded-14 bg-canvas px-14 py-10"
            >
              <span className="inline-flex items-center gap-8 text-14 font-600 text-ink">
                <span aria-hidden="true" className="size-6 rounded-full bg-lime" />
                {milestone.label}
              </span>
              <time dateTime={milestone.achievedOn} className="text-12 text-ink-muted">
                {t.achieved(shortCivilDay(milestone.achievedOn, timezone))}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
