import { ExerciseWorkspace } from '../../../../../../../../components/exercises/ExerciseWorkspace';
import { AppShell } from '../../../../../../../../components/shell/app-shell';
import { loadPracticeExercisePage } from '../../../../../../../../lib/exercise-page';
import { loadShellForFormation } from '../../../../../../../../lib/sidebar-page';
import { fr } from '../../../../../../../../messages/fr';

export const dynamic = 'force-dynamic';

const t = fr.exercises;

interface ExercisePageProps {
  params: Promise<{ fid: string; mid: string; aid: string }>;
}

/**
 * SCR-08 — `/formations/[fid]/modules/[mid]/exercices/[aid]` (SPEC-613 EF-1 to EF-4).
 * The server reads the exercise, the last attempt and the mastery; the client workspace owns the
 * production, the live table controls, the hints and the correction. Another learner is a 404.
 */
export default async function ExercisePage({ params }: ExercisePageProps) {
  const { fid, mid, aid } = await params;
  const [shell, exercise] = await Promise.all([
    loadShellForFormation(fid),
    loadPracticeExercisePage(fid, mid, aid),
  ]);

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <main
        className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
        style={{ overflowX: 'hidden' }}
      >
        {exercise.ok ? (
          <ExerciseWorkspace initial={exercise.data} />
        ) : (
          <section
            className="mx-auto mt-40 flex max-w-480 flex-col gap-12 rounded-24 border border-solid border-border bg-surface px-24 py-24 text-center"
            data-testid="exercise-error"
            role="alert"
          >
            <h1 className="m-0 font-display text-22 font-600">{t.errorTitle}</h1>
            <p className="m-0 text-14 text-ink-muted">{t.errorBody}</p>
            {exercise.requestId === undefined ? null : (
              <p className="m-0 text-12 text-ink-muted">Référence : {exercise.requestId}</p>
            )}
            <a
              className="mt-4 inline-flex min-h-44 items-center justify-center rounded-12 bg-ink px-16 text-14 font-700 text-white no-underline"
              href={`/formations/${fid}/modules/${mid}/exercices/${aid}`}
            >
              {t.retryLoad}
            </a>
          </section>
        )}
      </main>
    </AppShell>
  );
}
