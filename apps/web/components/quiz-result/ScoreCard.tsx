import type { QuizResultDto } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { fr } from '../../messages/fr';

import { AttemptHistory } from './AttemptHistory';

const t = fr.quiz;

function ringDash(score: number): string {
  const circumference = 402.1;
  return `${String((circumference * Math.min(100, Math.max(0, score))) / 100)} ${String(circumference)}`;
}

function thresholdLine(threshold: number): { x1: number; y1: number; x2: number; y2: number } {
  const angle = ((threshold * 3.6 - 90) * Math.PI) / 180;
  const x1 = 80 + Math.cos(angle) * 72;
  const y1 = 80 + Math.sin(angle) * 72;
  const x2 = 80 + Math.cos(angle) * 50;
  const y2 = 80 + Math.sin(angle) * 50;
  return { x1, y1, x2, y2 };
}

export function ScoreCard({
  result,
  currentModulePosition,
}: {
  result: QuizResultDto;
  currentModulePosition: number;
}) {
  const passed = result.passed === true;
  const score = Math.round(result.score ?? result.provisionalScore ?? 0);
  const line = thresholdLine(result.threshold);
  const headline = passed
    ? result.isLastModule
      ? t.resultHeadlineLast
      : t.resultHeadlinePassed(result.nextModule?.position ?? currentModulePosition + 1)
    : t.resultHeadlineMissing(result.pointsMissing ?? 0);
  const statusText = passed
    ? t.resultStatusTextPassed(result.gaps.length)
    : t.resultStatusTextFailed(result.gaps.length);

  return (
    <section
      aria-labelledby="t-score"
      className="flex flex-wrap items-center gap-28 rounded-28 border border-border bg-surface p-28"
      data-testid="result-score"
    >
      <div className="relative h-160 w-160 shrink-0" data-testid="result-ring">
        <svg aria-hidden="true" height="160" viewBox="0 0 160 160" width="160">
          <circle cx="80" cy="80" fill="none" r="64" stroke={colors.canvas} strokeWidth="14" />
          <circle
            cx="80"
            cy="80"
            fill="none"
            r="64"
            stroke={passed ? colors.indigo : colors.orange}
            strokeDasharray={ringDash(score)}
            strokeLinecap="round"
            strokeWidth="14"
            transform="rotate(-90 80 80)"
          />
          <line
            stroke={colors.ink}
            strokeLinecap="round"
            strokeWidth="3"
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-40 font-600 leading-none">{`${String(score)} %`}</span>
          <span className="mt-4 text-12 text-ink-muted" data-testid="result-threshold-caption">
            {t.resultThresholdCaption(result.threshold)}
          </span>
        </div>
      </div>
      <div className="flex min-w-[260px] flex-1 flex-col gap-10">
        <h2 className="sr-only" id="t-score">
          {t.resultTitle}
        </h2>
        <span
          className={`w-fit rounded-full px-12 py-6 text-12 font-700 ${
            passed ? 'bg-lime text-ink' : 'bg-orange-soft text-orange-ink'
          }`}
          data-testid="result-status"
        >
          {passed ? t.resultPassed : t.resultFailed}
        </span>
        <p
          className="m-0 font-display text-26 font-600 leading-1.2 tracking-title"
          data-testid="result-headline"
        >
          {headline}
        </p>
        <p className="m-0 text-15 leading-1.55 text-ink-muted" data-testid="result-status-text">
          {statusText}
        </p>
      </div>
      <AttemptHistory history={result.history} threshold={result.threshold} />
    </section>
  );
}
