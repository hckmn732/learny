import { PageHeader } from '@learny/ui';

import { AppShell } from '../../../../../components/shell/app-shell';
import { loadShellForFormation } from '../../../../../lib/sidebar-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface ProgrammePageProps {
  params: Promise<{ fid: string }>;
}

// SPEC-304/305 mount the shell on the Programme route so the active state of the sidebar and the
// fixed header can be exercised (CA-4). The programme content belongs to SPEC-606.
export default async function ProgrammePage({ params }: ProgrammePageProps) {
  const { fid } = await params;
  const shell = await loadShellForFormation(fid);
  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <main className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40">
        <PageHeader title={fr.shell.placeholder.programmeTitle} />
        <p className="mt-8 text-14 text-ink-muted">{fr.shell.placeholder.programmeBody}</p>
      </main>
    </AppShell>
  );
}
