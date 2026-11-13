import { isActiveProgramme } from '@learny/contracts';

import { ProgrammeGantt } from '../../../../../components/programme/ProgrammeGantt';
import { ProgrammeModuleCard } from '../../../../../components/programme/ProgrammeModuleCard';
import { ProgrammeProposal } from '../../../../../components/programme/ProgrammeProposal';
import { ProgrammeStats } from '../../../../../components/programme/ProgrammeStats';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadProgrammePage } from '../../../../../lib/programme-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface ProgrammePageProps {
  params: Promise<{ fid: string }>;
}

const t = fr.programme;

// SCR-05 — proposed programme (SPEC-605) or active programme (SPEC-606). The server chooses from
// the persisted formation status; the active screen never renders a provisional client state.
export default async function ProgrammePage({ params }: ProgrammePageProps) {
  const { fid } = await params;
  const { shell, state } = await loadProgrammePage(fid);

  if (!isActiveProgramme(state)) {
    return (
      <AppShell
        header={shell.header.ok ? shell.header.data : null}
        headerError={!shell.header.ok}
        sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
        sidebarError={!shell.sidebar.ok}
      >
        <ProgrammeProposal fid={fid} initial={state} />
      </AppShell>
    );
  }

  const openModule = state.modules.find((module) => module.status === 'open') ?? null;
  const badge =
    state.formation.status === 'paused'
      ? t.pausedStatusBadge
      : state.formation.status === 'completed'
        ? t.completedStatusBadge
        : t.activeStatusBadge;

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
          data-testid="programme-active-screen"
        >
          <header className="flex flex-wrap items-end justify-between gap-16">
            <div className="flex flex-1 basis-420 flex-col gap-8">
              <span className="self-start rounded-full bg-ink px-10 py-4 text-12 font-700 text-white">
                {badge}
              </span>
              <h1 className="m-0 font-display text-34 font-600 tracking-title">
                {state.formation.title}
              </h1>
              {state.formation.description === null ? null : (
                <p className="m-0 max-w-[680px] text-15 leading-1.5 text-ink-muted">
                  {state.formation.description}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-8">
              <a
                className="inline-flex min-h-48 items-center rounded-14 border border-border-strong bg-surface px-18 text-15 font-600 text-ink"
                data-testid="programme-exam-link"
                href={`/formations/${encodeURIComponent(fid)}/examen-blanc`}
              >
                {t.exam}
              </a>
              {openModule === null || openModule.href === null ? null : (
                <a
                  className="inline-flex min-h-48 items-center rounded-14 bg-ink px-22 text-15 font-700 text-white"
                  data-testid="programme-open-module"
                  href={openModule.href}
                >
                  {t.openCurrentModule}
                </a>
              )}
            </div>
          </header>

          {state.formation.status === 'paused' ? (
            <p
              className="m-0 rounded-16 border border-orange-border bg-orange-soft px-16 py-12 text-14 text-orange-ink-strong"
              role="status"
            >
              {t.pausedNotice}
            </p>
          ) : null}

          <ProgrammeStats programme={state} />
          <ProgrammeGantt programme={state} />

          <section
            aria-labelledby="t-modules"
            className="flex flex-col gap-10"
            data-testid="programme-modules"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-8">
              <h2 className="m-0 font-display text-22 font-600 tracking-heading" id="t-modules">
                {t.modulesTitle}
              </h2>
              <span className="text-13 text-ink-muted">
                Un module se débloque quand le quiz du précédent atteint son seuil.
              </span>
            </div>
            <ol className="m-0 flex list-none flex-col gap-10 p-0">
              {state.modules.map((module) => (
                <ProgrammeModuleCard
                  chapters={state.chapters.filter((chapter) => chapter.moduleId === module.id)}
                  defaultExpanded={module.status === 'open'}
                  key={module.id}
                  module={module}
                />
              ))}
            </ol>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
