import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getExamIntro } from '@learny/services';

import { ExamIntro } from '../../../../../components/mock-exam/ExamIntro';
import { AppShell } from '../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface ExamIntroPageProps {
  params: Promise<{ fid: string }>;
}

/** SCR-11 — introduction and format confirmation of the mock exam (SPEC-614 EF-1, EF-5). */
export default async function ExamIntroPage({ params }: ExamIntroPageProps) {
  const { fid } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [intro, shell] = await Promise.all([getExamIntro(ctx, fid), loadShellForFormation(fid)]);
  if (!intro.ok) {
    if (intro.error.code === 'NOT_FOUND') notFound();
    throw intro.error;
  }

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <ExamIntro
        intro={intro.value}
        programmeHref={`/formations/${encodeURIComponent(fid)}/programme`}
      />
    </AppShell>
  );
}
