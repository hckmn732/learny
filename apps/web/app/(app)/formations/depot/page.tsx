import { AppShell } from '../../../../components/shell/app-shell';
import { DepotScreen } from '../../../../components/simple/depot-screen';
import { loadShellPage } from '../../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

// SCR-21 — dépôt d'un cours, avant la création de la formation (SPEC-4002 EF-2).
export default async function SimpleDepotPage() {
  const shell = await loadShellPage();
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <DepotScreen fid={null} initialState={null} />
    </AppShell>
  );
}
