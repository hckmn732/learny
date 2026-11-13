import { randomUUID } from 'node:crypto';

import { notFound, redirect } from 'next/navigation';

import { createServiceContext, getActiveProgramme, getModuleScreen } from '@learny/services';

import { ModuleScreen } from '../../../../../../components/module/ModuleScreen';
import { AppShell } from '../../../../../../components/shell/app-shell';
import { SIGN_IN_PATH } from '../../../../../../lib/route-guard';
import { loadShellForFormation } from '../../../../../../lib/sidebar-page';
import { readPageSession } from '../../../../../../lib/supabase/page';
import { fr } from '../../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface ModulePageProps {
  params: Promise<{ fid: string; mid: string }>;
  searchParams: Promise<{ chapitre?: string }>;
}

const t = fr.programme;

/**
 * SCR-06 — module and apports (SPEC-607). SPEC-606 keeps the access gate: a locked module shows
 * its unlock condition and no chapter content. The open module is rendered from the RLS read model;
 * the client component only runs mutations and polling.
 */
export default async function ModulePage({ params, searchParams }: ModulePageProps) {
  const { fid, mid } = await params;
  const { chapitre } = await searchParams;
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
  const locked = selected.status === 'locked';

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      {locked ? (
        <main className="mx-auto w-full px-16 pb-40 shell:px-40">
          <div
            className="mx-auto flex w-full max-w-[1160px] flex-col gap-24"
            data-testid="module-locked"
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
          </div>
        </main>
      ) : (
        <ModuleContent ctx={ctx} mid={mid} chapterId={chapitre} />
      )}
    </AppShell>
  );
}

async function ModuleContent({
  ctx,
  mid,
  chapterId,
}: {
  ctx: ReturnType<typeof createServiceContext>;
  mid: string;
  chapterId: string | undefined;
}) {
  const screen = await getModuleScreen(ctx, mid, chapterId);
  if (!screen.ok) {
    if (screen.error.code === 'NOT_FOUND') notFound();
    throw screen.error;
  }
  return <ModuleScreen initial={screen.value} />;
}
