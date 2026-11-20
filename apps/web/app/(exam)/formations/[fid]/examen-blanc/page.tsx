import { notFound, redirect } from 'next/navigation';

import { ExamIntro } from '../../../../../components/mock-exam/ExamIntro';
import { AppShell } from '../../../../../components/shell/app-shell';
import { isApiError, serverApi } from '../../../../../lib/api/server-client';
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
  const client = await serverApi();
  let intro;
  let shell;
  try {
    [intro, shell] = await Promise.all([
      client.api.getExamIntro({ params: { fid } }),
      loadShellForFormation(fid),
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
      <ExamIntro intro={intro} programmeHref={`/formations/${encodeURIComponent(fid)}/programme`} />
    </AppShell>
  );
}
