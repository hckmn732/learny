import { notFound, redirect } from 'next/navigation';

import { RemediationScreen } from '../../../../../../../components/remediation/RemediationScreen';
import { AppShell } from '../../../../../../../components/shell/app-shell';
import { isApiError, serverApi } from '../../../../../../../lib/api/server-client';
import { SIGN_IN_PATH } from '../../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface RemediationPageProps {
  params: Promise<{ fid: string; mid: string }>;
}

/** SCR-09 remediation (SPEC-612 EF-6): tutor texts, excerpts, quiz-like questions and completion. */
export default async function RemediationPage({ params }: RemediationPageProps) {
  const { fid, mid } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const client = await serverApi();
  let shell;
  let remediation;
  try {
    [shell, remediation] = await Promise.all([
      loadShellForFormation(fid),
      client.api.getRemediation({ params: { mid } }),
    ]);
  } catch (error) {
    if (isApiError(error, 'NOT_FOUND')) notFound();
    if (isApiError(error, 'UNAUTHENTICATED')) redirect(SIGN_IN_PATH);
    throw error;
  }
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <RemediationScreen
        formationId={fid}
        initial={remediation}
        moduleId={mid}
        modulePosition={remediation.module.position}
        moduleTitle={remediation.module.title}
      />
    </AppShell>
  );
}
