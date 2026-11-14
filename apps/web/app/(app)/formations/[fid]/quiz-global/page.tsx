import { ErrorState } from '@learny/ui';

import { GlobalQuizSession } from '../../../../../components/global-quiz/GlobalQuizSession';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadGlobalQuizPage } from '../../../../../lib/global-quiz-page';
import { loadShellForFormation } from '../../../../../lib/sidebar-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface QuizGlobalPageProps {
  params: Promise<{ fid: string }>;
}

/**
 * SCR-10 — `/formations/[fid]/quiz-global` (SPEC-701 EF-1, EF-2, ET-9; BR-MEM-03/08/09/10).
 *
 * The server creates or replays the session of the local day and preloads its DTO, the module
 * labels and the due labels of the recall card. A foreign formation is a 404 before rendering;
 * every answer then goes through the idempotent route and refreshes this same query.
 */
export default async function QuizGlobalPage({ params }: QuizGlobalPageProps) {
  const { fid } = await params;
  const [shell, quiz] = await Promise.all([loadShellForFormation(fid), loadGlobalQuizPage(fid)]);

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <main
        className="mx-auto flex w-full max-w-content flex-col gap-24 px-16 pb-40 shell:px-40"
        data-testid="global-quiz-page"
      >
        {quiz.ok ? (
          <GlobalQuizSession
            dueLabelsByPosition={quiz.data.dueLabelsByPosition}
            formationId={fid}
            initial={quiz.data.session}
            timeZone={quiz.data.timeZone}
          />
        ) : (
          <ErrorState
            data-testid="global-quiz-error"
            title={fr.globalQuiz.errorTitle}
            {...(quiz.requestId === undefined ? {} : { requestId: quiz.requestId })}
          />
        )}
      </main>
    </AppShell>
  );
}
