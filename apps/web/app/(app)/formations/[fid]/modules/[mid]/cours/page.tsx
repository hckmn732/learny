import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getActiveProgramme, getModuleCourse } from '@learny/services';

import { CourseScreen } from '../../../../../../../components/course/CourseScreen';
import { AppShell } from '../../../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

interface CoursePageProps {
  params: Promise<{ fid: string; mid: string }>;
  searchParams: Promise<{ chapitre?: string }>;
}

/**
 * SCR-07 — lecture du cours (SPEC-608). SPEC-606 keeps the access gate: a locked module has no
 * course. The page renders the RLS read model; the client component only polls while a generation
 * is running and reveals the flash-question answers (ADR-0065).
 */
export default async function CoursePage({ params, searchParams }: CoursePageProps) {
  const { fid, mid } = await params;
  const { chapitre } = await searchParams;
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

  if (selected.status === 'locked') {
    return (
      <AppShell
        header={shell.header.ok ? shell.header.data : null}
        headerError={!shell.header.ok}
        sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
        sidebarError={!shell.sidebar.ok}
      >
        <main className="mx-auto w-full px-16 pb-40 shell:px-40">
          <div
            className="mx-auto flex w-full max-w-[1160px] flex-col gap-16 rounded-24 border border-border bg-surface p-28"
            data-testid="course-locked"
          >
            <h1 className="m-0 font-display text-34 font-600 tracking-title">Cours verrouillé</h1>
            <p className="m-0 text-15 text-ink-muted">
              Ce module se débloque quand le quiz du module précédent est validé.
            </p>
            <a
              className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
              href={`/formations/${encodeURIComponent(fid)}/programme`}
            >
              Retour au programme
            </a>
          </div>
        </main>
      </AppShell>
    );
  }

  const screen = await getModuleCourse(ctx, mid, chapitre);
  if (!screen.ok) {
    if (screen.error.code === 'NOT_FOUND') notFound();
    throw screen.error;
  }

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <CourseScreen initial={screen.value} />
    </AppShell>
  );
}
