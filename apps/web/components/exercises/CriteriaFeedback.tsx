'use client';

import type { ExerciseCorrection } from '@learny/contracts';
import { Button, cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.exercises;

export interface CriteriaFeedbackProps {
  correction: ExerciseCorrection;
  busy?: boolean;
  onRetry: () => void;
  gapsHref: string;
}

/** Correction by criterion of SCR-08 (EF-2, ET-3): icon + text, never colour alone. */
export function CriteriaFeedback({
  correction,
  busy = false,
  onRetry,
  gapsHref,
}: CriteriaFeedbackProps) {
  const passed = correction.verdict === 'passed';
  return (
    <section
      aria-labelledby="exercise-feedback-title"
      aria-live="polite"
      className="flex flex-col gap-16 rounded-24 border border-solid border-border bg-surface px-24 py-24"
      data-testid="exercise-feedback"
    >
      <div className="flex flex-wrap items-center justify-between gap-12">
        <div className="flex flex-col gap-4">
          <h2
            className="m-0 text-12 font-700 tracking-kicker text-ink-muted uppercase"
            id="exercise-feedback-title"
          >
            {t.correction}
          </h2>
          <p className="m-0 font-display text-28 font-600" data-testid="exercise-score">
            {t.score(correction.score, correction.maxScore)}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-12 py-6 text-13 font-700',
            passed ? 'bg-lime text-ink' : 'bg-orange-soft text-orange-ink',
          )}
          data-testid="exercise-verdict"
        >
          {passed ? t.verdictPassed : t.verdictRetry}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-8 p-0">
        {correction.criteria.map((criterion) => (
          <li
            className="flex items-start gap-12 rounded-12 bg-surface-subtle px-12 py-10"
            data-testid="exercise-criterion"
            key={criterion.key}
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-26 flex-none items-center justify-center rounded-full text-13 font-700',
                criterion.ok ? 'bg-green-soft text-green-ink' : 'bg-orange-soft text-orange-ink',
              )}
            >
              {criterion.ok ? '✓' : '✗'}
            </span>
            <span className="flex flex-col gap-2">
              <span className="text-14 font-700">
                {t.criterion(criterion.label, criterion.earned, criterion.points)}
                <span className="sr-only">{criterion.ok ? ' : réussi' : ' : à revoir'}</span>
              </span>
              <span className="text-13 leading-1.5 text-ink-secondary">{criterion.comment}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 rounded-16 bg-canvas px-16 py-14 text-15 leading-1.55">
        <strong>Le tuteur :</strong> {correction.summary}
      </p>
      <p className="m-0 text-14 leading-1.5 text-ink-secondary" data-testid="exercise-next-step">
        {correction.nextStep.label}
      </p>
      <div className="flex flex-wrap gap-8">
        <a
          className="inline-flex min-h-44 items-center rounded-12 bg-ink px-16 text-14 font-700 text-white no-underline"
          data-testid="exercise-next"
          href={correction.nextStep.href}
        >
          {t.next}
        </a>
        <Button
          data-testid="exercise-retry"
          disabled={busy}
          onClick={onRetry}
          size="md"
          variant="outline"
        >
          {t.retry}
        </Button>
        <a
          className="inline-flex min-h-44 items-center rounded-12 border border-solid border-border-strong bg-surface px-16 text-14 font-600 text-ink no-underline"
          href={gapsHref}
        >
          {t.gaps}
        </a>
      </div>
    </section>
  );
}
