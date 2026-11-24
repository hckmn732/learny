import { AppShell } from '../../../../../components/shell/app-shell';
import { DiagnosticScreen } from '../../../../../components/simple/diagnostic-screen';
import { loadSimpleDiagnosticPage } from '../../../../../lib/simple-page';

export const dynamic = 'force-dynamic';

interface SimpleDiagnosticPageProps {
  params: Promise<{ fid: string }>;
}

// SCR-24 — diagnostic global du mode simple (SPEC-4002 EF-6).
export default async function SimpleDiagnosticPage({ params }: SimpleDiagnosticPageProps) {
  const { fid } = await params;
  const { shell } = await loadSimpleDiagnosticPage(fid);
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <DiagnosticScreen fid={fid} />
    </AppShell>
  );
}
