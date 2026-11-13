import type { GapCardDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

const t = fr.quiz;

export function GapCards({ gaps, passed }: { gaps: readonly GapCardDto[]; passed: boolean }) {
  if (gaps.length === 0) return null;
  return (
    <section aria-labelledby="t-lacunes" className="flex flex-col gap-12" data-testid="result-gaps">
      <div className="flex flex-wrap items-baseline justify-between gap-8">
        <h2 className="m-0 font-display text-22 font-600 tracking-title" id="t-lacunes">
          {passed ? t.resultFragileTitle(gaps.length) : t.resultGapsTitle(gaps.length)}
        </h2>
        <span className="text-13 text-ink-muted">{t.resultGapsSubtitle}</span>
      </div>
      <div className="flex flex-wrap gap-12">
        {gaps.map((gap) => (
          <article
            className="flex min-w-[260px] flex-1 flex-col gap-10 rounded-[22px] border border-border bg-surface p-20"
            data-testid="result-gap-card"
            key={gap.notionId}
          >
            <span className="self-start rounded-full bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink">
              {gap.natureLabel}
            </span>
            <h3 className="m-0 font-display text-19 font-600">{gap.label}</h3>
            <p className="m-0 text-14 leading-1.5 text-ink-muted">{gap.evidence}</p>
            <p className="m-0 rounded-12 bg-canvas px-12 py-10 text-14 leading-1.45">
              <strong>{t.resultTutorProposal}</strong> {gap.proposal}
            </p>
            <a
              className="inline-flex min-h-44 w-fit items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
              data-testid="result-gap-train"
              href={gap.trainHref}
            >
              {t.resultTrain}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
