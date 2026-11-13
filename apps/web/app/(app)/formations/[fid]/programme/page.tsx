import { ProgrammeProposal } from '../../../../../components/programme/ProgrammeProposal';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadProgrammePage } from '../../../../../lib/programme-page';

export const dynamic = 'force-dynamic';

interface ProgrammePageProps {
  params: Promise<{ fid: string }>;
}

// SCR-05 — proposed programme, adjustment, import and validation (SPEC-605). The active screen
// belongs to SPEC-606 and reuses the same service and components.
export default async function ProgrammePage({ params }: ProgrammePageProps) {
  const { fid } = await params;
  const { shell, state } = await loadProgrammePage(fid);
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
