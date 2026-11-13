import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getQuizResult } from '@learny/services';

import { QuizResultScreen } from '../../../../../../../../../components/quiz-result/QuizResultScreen';
import { AppShell } from '../../../../../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface QuizResultPageProps {
  params: Promise<{ fid: string; mid: string; attemptId: string }>;
}

/**
 * SCR-09 result (SPEC-612): score, threshold, attempts, gaps, mastered notions and actions. The
 * pending correction is polled every three seconds (ADR-0065); the module header comes from the
 * RLS programme read model so a foreign attempt stays a 404.
 */
export default async function QuizResultPage({ params }: QuizResultPageProps) {
  const { fid, mid, attemptId } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, result] = await Promise.all([
    loadShellForFormation(fid),
    getQuizResult(ctx, attemptId),
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
        formationId={fid}
        initial={result.value}
        moduleId={mid}
        modulePosition={result.value.module.position}
        moduleTitle={result.value.module.title}
      />
    </AppShell>
  );
}
