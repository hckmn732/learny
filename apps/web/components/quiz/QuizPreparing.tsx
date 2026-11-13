'use client';

import { fr } from '../../messages/fr';

const t = fr.quiz;

export function QuizPreparing({
  timedOut,
  onRetry,
}: {
  timedOut: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className="flex flex-col gap-12 rounded-28 border border-border bg-surface p-32"
      data-testid="quiz-preparing"
      role="status"
    >
      <h2 className="m-0 font-display text-22 font-600">
        {timedOut ? t.retry : t.preparing}
      </h2>
      <p className="m-0 text-15 text-ink-muted">
        {timedOut ? t.preparingTooLong : t.preparing}
      </p>
      {timedOut ? (
        <button
          className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
          data-testid="quiz-preparing-retry"
          onClick={onRetry}
          type="button"
        >
          {t.retry}
        </button>
      ) : null}
    </section>
  );
}
