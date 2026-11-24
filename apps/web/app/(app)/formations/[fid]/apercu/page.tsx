import { AppShell } from '../../../../../components/shell/app-shell';
import { OverviewScreen } from '../../../../../components/simple/overview-screen';
import { loadSimpleOverviewPage } from '../../../../../lib/simple-page';

export const dynamic = 'force-dynamic';

interface SimpleOverviewPageProps {
  params: Promise<{ fid: string }>;
}

// SCR-23 — aperçu du programme tiré du document (SPEC-4002 EF-5).
export default async function SimpleOverviewPage({ params }: SimpleOverviewPageProps) {
  const { fid } = await params;
  const { shell, state, programme } = await loadSimpleOverviewPage(fid);
  const sidebar = shell.sidebar.ok ? shell.sidebar.data : null;
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={sidebar}
      sidebarError={!shell.sidebar.ok}
    >
      <OverviewScreen
        activeFormations={(sidebar?.formations ?? []).filter(
          (formation) => formation.status === 'active',
        )}
        fid={fid}
        programme={programme}
        state={state}
      />
    </AppShell>
  );
}
