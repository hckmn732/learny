import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getActiveProgramme } from '@learny/services';

import { QuizScreen } from '../../../../../../../components/quiz/QuizScreen';
import { AppShell } from '../../../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../../lib/supabase/page';
import { fr } from '../../../../../../../messages/fr';

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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, programme] = await Promise.all([
    loadShellForFormation(fid),
    getActiveProgramme(ctx, fid),
  ]);
  if (!programme.ok) {
    if (programme.error.code === 'NOT_FOUND') notFound();
    if (programme.error.code === 'CONFLICT') redirect(`/formations/${fid}/programme`);
    throw programme.error;
  }
  const selected = programme.value.modules.find((entry) => entry.id === mid);
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
        <main className="mx-auto w-full px-16 pb-40 shell:px-40">
          <div
            className="mx-auto flex w-full max-w-[920px] flex-col gap-12 rounded-28 border border-border bg-surface p-32"
            data-testid="quiz-locked"
          >
            <h1 className="m-0 font-display text-30 font-600">{fr.quiz.lockedTitle}</h1>
            <p className="m-0 text-15 text-ink-muted">{fr.quiz.lockedText}</p>
            <a
              className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
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
