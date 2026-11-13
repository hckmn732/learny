'use client';

import { fr } from '../../../../../../../../messages/fr';

const t = fr.exercises;

/** Distinct error state of SCR-08: never colour alone, retry reachable by keyboard. */
export default function ExerciseError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40">
      <section
        className="mx-auto mt-40 flex max-w-480 flex-col gap-12 rounded-24 border border-solid border-border bg-surface px-24 py-24 text-center"
        data-testid="exercise-error-boundary"
        role="alert"
      >
        <h1 className="m-0 font-display text-22 font-600">{t.errorTitle}</h1>
        <p className="m-0 text-14 text-ink-muted">{t.errorBody}</p>
        <button
          className="mt-4 min-h-44 cursor-pointer rounded-12 border-0 bg-ink px-16 text-14 font-700 text-white"
          onClick={reset}
          type="button"
        >
          {t.retryLoad}
        </button>
      </section>
    </main>
  );
}
