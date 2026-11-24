import { AppShell } from '../../../../../components/shell/app-shell';
import { DepotScreen } from '../../../../../components/simple/depot-screen';
import { loadSimpleDepotPage } from '../../../../../lib/simple-page';

export const dynamic = 'force-dynamic';

interface SimpleDepotFidPageProps {
  params: Promise<{ fid: string }>;
}

// SCR-21 et SCR-22 — dépôt puis analyse de la formation créée (SPEC-4002 EF-2, EF-4).
export default async function SimpleDepotFidPage({ params }: SimpleDepotFidPageProps) {
  const { fid } = await params;
  const { shell, state } = await loadSimpleDepotPage(fid);
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <DepotScreen fid={fid} initialState={state} />
    </AppShell>
  );
}
