import { AgendaScreen } from '../../../components/agenda/AgendaScreen';
import { AppShell } from '../../../components/shell/app-shell';
import { loadAgendaPage, type AgendaSearchParams } from '../../../lib/agenda-page';
import { loadShellPage } from '../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

interface AgendaPageProps {
  searchParams: Promise<AgendaSearchParams>;
}

/** SCR-12 — the agenda of the connected learner (SPEC-704, ET-8). */
export default async function AgendaPage({ searchParams }: AgendaPageProps) {
  const [shell, params] = await Promise.all([loadShellPage(), searchParams]);
  const agenda = await loadAgendaPage(params);
  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <AgendaScreen
        initialState={agenda.state}
        initialData={agenda.ok ? agenda.data : null}
        initialError={!agenda.ok}
        {...(agenda.ok || agenda.requestId === undefined ? {} : { requestId: agenda.requestId })}
      />
    </AppShell>
  );
}
