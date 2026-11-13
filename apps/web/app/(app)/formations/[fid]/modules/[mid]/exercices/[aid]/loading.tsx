import { fr } from '../../../../../../../../messages/fr';

const t = fr.exercises;

/** Distinct loading state of SCR-08 (SPEC-613 §10), announced to screen readers. */
export default function ExerciseLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      data-testid="exercise-loading"
      role="status"
    >
      <p className="sr-only">{t.loading}</p>
      <div className="mt-28 flex animate-pulse flex-col gap-18 motion-reduce:animate-none">
        <div className="h-16 w-320 rounded-8 bg-surface-muted" />
        <div className="h-40 w-520 rounded-12 bg-surface-muted" />
        <div className="h-220 rounded-24 bg-surface-muted" />
        <div className="h-380 rounded-24 bg-surface-muted" />
      </div>
    </main>
  );
}
