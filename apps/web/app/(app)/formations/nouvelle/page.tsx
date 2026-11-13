import { AppShell } from '../../../../components/shell/app-shell';
import { NewFormationChat } from '../../../../components/cadrage/CadrageChat';
import { loadShellPage } from '../../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

// SCR-04 — first step of the creation: the subject field and the first cadrage question.
export default async function NewFormationPage() {
  const shell = await loadShellPage();
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <NewFormationChat />
    </AppShell>
  );
}
