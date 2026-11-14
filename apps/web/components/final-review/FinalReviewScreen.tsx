import type { FinalReviewDto } from '@learny/contracts';
import { shortCivilDay } from '@learny/services/home/derive';
import { PageHeader } from '@learny/ui';

import { fr } from '../../messages/fr';

import { FragileNotions } from './FragileNotions';
import { MaintenanceChoice } from './MaintenanceChoice';
import { MilestoneList } from './MilestoneList';
import { NotionMap } from './NotionMap';
import { FinalReviewStats } from './Stats';

const t = fr.finalReview;

function masteredLabels(data: FinalReviewDto): string[] {
  return data.modules.flatMap((module) =>
    module.notions
      .filter(
        (notion) =>
          notion.gapNature === null &&
          notion.mastery !== null &&
          notion.mastery >= module.threshold,
      )
      .map((notion) => notion.label),
  );
}

/**
 * SCR-16 — `/formations/[fid]/bilan` (SPEC-617 EF-1 to EF-3; BR-FOR-12, BR-PRO-03).
 *
 * Header of the « Lacunes » type, statistics row, acquisition card, notion map frozen at the
 * completion date, fragile notions and the editable memory-interview choice. The screen is
 * composed only of design-system components and tokens (ADR-0034, CA-5).
 */
export function FinalReviewScreen({ data }: Readonly<{ data: FinalReviewDto }>) {
  const date = shortCivilDay(data.completedOn, data.timezone);
  const acquired = masteredLabels(data);
  return (
    <div data-testid="final-review" className="flex flex-col gap-24">
      <PageHeader
        eyebrow={t.eyebrow(data.formationTitle)}
        title={t.title}
        actions={
          <span
            data-testid="final-review-result"
            className="inline-flex min-h-44 items-center rounded-full bg-indigo-soft px-18 text-14 font-700 text-indigo-ink-strong"
          >
            {t.result(data.stats.resultPercent)}
          </span>
        }
      />
      <p data-testid="final-review-completion" className="m-0 text-14 text-ink-muted">
        {t.completed(date, data.weeks)}
        {data.programVersion === null ? '' : ` · ${t.programVersion(data.programVersion)}`}
      </p>

      <FinalReviewStats stats={data.stats} retention={data.retention} />

      <section
        data-testid="final-review-acquired"
        aria-labelledby="final-review-acquired-title"
        className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface px-24 py-22"
      >
        <h2
          id="final-review-acquired-title"
          className="m-0 font-display text-22 font-600 tracking-heading"
        >
          {t.acquired.title}
        </h2>
        <p className="m-0 text-13 leading-1.5 text-ink-muted">
          {t.acquired.description(data.stats.masteredNotions)}
        </p>
        {acquired.length === 0 ? (
          <p className="m-0 text-14 text-ink-muted">{t.acquired.empty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-8 p-0">
            {acquired.map((label) => (
              <li
                key={label}
                data-testid="final-review-acquired-notion"
                className="inline-flex items-center gap-6 rounded-full bg-green-soft px-10 py-4 text-12 font-600 text-green-ink"
              >
                <span aria-hidden="true" className="size-6 rounded-full bg-green" />
                {label}
              </li>
            ))}
          </ul>
        )}
      </section>

      <MilestoneList milestones={data.milestones} timezone={data.timezone} />

      <NotionMap modules={data.modules} mapHref={data.mapHref} />

      <FragileNotions gaps={data.gaps} />

      <MaintenanceChoice initial={data} />
    </div>
  );
}
