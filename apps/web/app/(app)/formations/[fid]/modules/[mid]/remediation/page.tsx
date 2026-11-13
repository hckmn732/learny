import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getActiveProgramme, getRemediation } from '@learny/services';

import { RemediationScreen } from '../../../../../../../components/remediation/RemediationScreen';
import { AppShell } from '../../../../../../../components/shell/app-shell';
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
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, programme, remediation] = await Promise.all([
    loadShellForFormation(fid),
    getActiveProgramme(ctx, fid),
    getRemediation(ctx, mid),
  ]);
  if (!remediation.ok) {
    if (remediation.error.code === 'NOT_FOUND') notFound();
    throw remediation.error;
  }
  if (!programme.ok) {
    if (programme.error.code === 'NOT_FOUND') notFound();
    throw programme.error;
  }
  const selected = programme.value.modules.find((entry) => entry.id === mid);
  if (selected === undefined) notFound();
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <RemediationScreen
        formationId={fid}
        initial={remediation.value}
        moduleId={mid}
        modulePosition={selected.position}
        moduleTitle={selected.title}
      />
    </AppShell>
  );
}
