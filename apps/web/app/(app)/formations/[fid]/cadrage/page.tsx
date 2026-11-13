import { CadrageChat } from '../../../../../components/cadrage/CadrageChat';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadCadragePage } from '../../../../../lib/cadrage-page';

export const dynamic = 'force-dynamic';

interface CadragePageProps {
  params: Promise<{ fid: string }>;
  searchParams: Promise<{ erreur?: string }>;
}

// SCR-04 — resumable cadrage of one formation; any other status is redirected to the programme.
export default async function CadragePage({ params, searchParams }: CadragePageProps) {
  const { fid } = await params;
  const { erreur } = await searchParams;
  const { shell, state } = await loadCadragePage(fid);
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <CadrageChat creationError={erreur ?? null} fid={fid} initialState={state} />
    </AppShell>
  );
}
