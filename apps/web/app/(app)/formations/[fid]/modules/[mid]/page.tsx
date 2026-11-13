import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getActiveProgramme } from '@learny/services';

import { AppShell } from '../../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../lib/supabase/page';
import { fr } from '../../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface ModulePageProps {
  params: Promise<{ fid: string; mid: string }>;
}

const t = fr.programme;

// SCR-06 access gate (SPEC-606 CL-4, ET-4). The full module and apports screen belongs to
// SPEC-607; this first version enforces the same lock before any module content is rendered.
export default async function ModulePage({ params }: ModulePageProps) {
  const { fid, mid } = await params;
  const session = await readPageSession();
  if (session === null) redirect(SIGN_IN_PATH);
  const ctx = createServiceContext({ userId: session.userId, requestId: randomUUID() });
  const [shell, result] = await Promise.all([
    loadShellForFormation(fid),
    getActiveProgramme(ctx, fid),
  ]);
  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound();
    if (result.error.code === 'CONFLICT') redirect(`/formations/${fid}/programme`);
    throw result.error;
  }
  const selected = result.value.modules.find((entry) => entry.id === mid);
  if (selected === undefined) notFound();
  const chapters = result.value.chapters.filter((chapter) => chapter.moduleId === selected.id);
  const locked = selected.status === 'locked';
  const base = selected.href;

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <main className="mx-auto w-full px-16 pb-40 shell:px-40">
        <div
          className="mx-auto flex w-full max-w-[1160px] flex-col gap-24"
          data-testid={locked ? 'module-locked' : 'module-page'}
        >
          <nav aria-label="Fil d’Ariane" className="flex flex-wrap items-center gap-8 text-13">
            <a className="font-600" href={`/formations/${encodeURIComponent(fid)}/programme`}>
              Programme
            </a>
            <span aria-hidden="true" className="text-ink-muted">
              /
            </span>
            <span className="text-ink-muted">
              Module {selected.position} · {selected.title}
            </span>
          </nav>

          {locked ? (
            <section className="flex flex-col gap-12 rounded-24 border border-border bg-surface p-28">
              <span className="self-start rounded-full bg-surface-muted px-12 py-6 text-12 font-700 text-ink-muted">
                {t.activeModuleStatus.locked}
              </span>
              <h1 className="m-0 font-display text-34 font-600 tracking-title">
                {t.moduleLockedTitle}
              </h1>
              <p className="m-0 text-15 text-ink-muted" data-testid="module-unlock-reason">
                {t.lockedHint(selected.unlockAfterPosition ?? Math.max(1, selected.position - 1))}
              </p>
              <a
                className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-16 text-14 font-700 text-white"
                href={`/formations/${encodeURIComponent(fid)}/programme`}
              >
                {t.backToProgramme}
              </a>
            </section>
          ) : (
            <section className="flex flex-col gap-18 rounded-24 border border-border bg-surface p-28">
              <div className="flex flex-wrap items-center justify-between gap-12">
                <h1 className="m-0 font-display text-34 font-600 tracking-title">
                  Module {selected.position} · {selected.title}
                </h1>
                <span
                  className="rounded-full bg-lime px-12 py-6 text-12 font-700 text-ink"
                  data-status={selected.status}
                  data-testid="module-status"
                >
                  {t.activeModuleStatus[selected.status]}
                </span>
              </div>
              <p className="m-0 text-15 text-ink-muted">
                {selected.plannedStart} – {selected.plannedEnd}
              </p>
              <h2 className="m-0 font-display text-22 font-600">{t.modulesTitle}</h2>
              <ol
                className="m-0 grid list-none grid-cols-1 gap-8 p-0 md:grid-cols-2"
                data-testid="module-chapters"
              >
                {chapters.map((chapter) => (
                  <li
                    className="flex flex-col gap-2 rounded-14 bg-surface-subtle px-14 py-12 text-14 font-500"
                    key={chapter.id}
                  >
                    <span>{chapter.title}</span>
                    <span className="text-12 text-ink-muted">
                      {t.chapterStatus[chapter.contributionsStatus]}
                    </span>
                  </li>
                ))}
              </ol>
              {base === null ? null : (
                <div className="flex flex-wrap gap-8">
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                    href={base}
                  >
                    {t.apports}
                  </a>
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                    href={`${base}/cours`}
                  >
                    {t.readCourse}
                  </a>
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                    href={`${base}/exercices`}
                  >
                    {t.practice}
                  </a>
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 bg-lime px-16 text-14 font-700 text-ink"
                    href={`${base}/quiz`}
                  >
                    {t.passQuiz}
                  </a>
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}
