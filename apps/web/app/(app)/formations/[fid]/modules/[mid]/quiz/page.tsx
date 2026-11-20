import { notFound, redirect } from 'next/navigation';

import { isActiveProgramme } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/quiz';

import { QuizScreen } from '../../../../../../../components/quiz/QuizScreen';
import { AppShell } from '../../../../../../../components/shell/app-shell';
import { isApiError, serverApi } from '../../../../../../../lib/api/server-client';
import { SIGN_IN_PATH } from '../../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface QuizPageProps {
  params: Promise<{ fid: string; mid: string }>;
}

/**
 * SCR-09 — passage du quiz de validation (SPEC-611 EF-1, EF-2). The server checks the module access
 * (BR-FOR-08) and hands the shell to the client, which creates or resumes the attempt on mount.
 */
export default async function QuizPage({ params }: QuizPageProps) {
  const { fid, mid } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const client = await serverApi();
  let shell;
  let programme;
  try {
    [shell, programme] = await Promise.all([
      loadShellForFormation(fid),
      client.api.programmeGet({ params: { fid }, query: {} }),
    ]);
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    if (isApiError(error, 'CONFLICT')) redirect(`/formations/${fid}/programme`);
    throw error;
  }
  if (!isActiveProgramme(programme)) redirect(`/formations/${fid}/programme`);
  const selected = programme.modules.find((entry) => entry.id === mid);
  if (selected === undefined) notFound();
  const programmeHref = `/formations/${encodeURIComponent(fid)}/programme`;
  const moduleHref = `/formations/${encodeURIComponent(fid)}/modules/${encodeURIComponent(mid)}`;

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      {selected.status === 'locked' ? (
        <main className="mx-auto w-full px-16 pb-40 nav:px-40">
          <div
            className="mx-auto flex w-full max-w-[920px] flex-col gap-12 rounded-28 border border-border bg-surface p-32"
            data-testid="quiz-locked"
          >
            <h1 className="m-0 font-display text-30 font-600">{fr.quiz.lockedTitle}</h1>
            <p className="m-0 text-15 text-ink-muted">{fr.quiz.lockedText}</p>
            <a
              className="touch-target inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
              href={programmeHref}
            >
              {fr.quiz.lockedBack}
            </a>
          </div>
        </main>
      ) : (
        <QuizScreen
          formationId={fid}
          moduleHref={moduleHref}
          moduleId={mid}
          modulePosition={selected.position}
          moduleTitle={selected.title}
          programmeHref={programmeHref}
          threshold={selected.threshold}
        />
      )}
    </AppShell>
  );
}
