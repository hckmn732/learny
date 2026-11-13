import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getAttemptResult } from '@learny/services';

import { QuizResultScreen } from '../../../../../../../../../components/quiz/QuizResultScreen';
import { AppShell } from '../../../../../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface QuizResultPageProps {
  params: Promise<{ fid: string; mid: string; attemptId: string }>;
}

/**
 * SCR-09 result (partial until SPEC-612): the tutor correction is tracked by polling every three
 * seconds (ADR-0065); the full detailed screen, unlock and remediation belong to SPEC-612.
 */
export default async function QuizResultPage({ params }: QuizResultPageProps) {
  const { fid, mid, attemptId } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, result] = await Promise.all([
    loadShellForFormation(fid),
    getAttemptResult(ctx, attemptId),
  ]);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    throw result.error;
  }
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <QuizResultScreen
        attemptId={attemptId}
        initial={result.value}
        moduleHref={`/formations/${encodeURIComponent(fid)}/modules/${encodeURIComponent(mid)}`}
      />
    </AppShell>
  );
}
