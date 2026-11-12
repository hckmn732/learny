import { PageHeader } from '@learny/ui';

import { AppShell } from '../../../../../components/shell/app-shell';
import { loadSidebarForFormation } from '../../../../../lib/sidebar-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface ProgrammePageProps {
  params: Promise<{ fid: string }>;
}

// SPEC-304 mounts the shell on the Programme route so the active state of the sidebar can be
// exercised (CA-4). The programme content belongs to SPEC-606.
export default async function ProgrammePage({ params }: ProgrammePageProps) {
  const { fid } = await params;
  const sidebar = await loadSidebarForFormation(fid);
  return (
    <AppShell sidebar={sidebar.ok ? sidebar.data : null} sidebarError={!sidebar.ok}>
      <main className="mx-auto w-full max-w-content px-16 pt-64 pb-40 shell:px-40 shell:pt-28">
        <PageHeader title={fr.shell.placeholder.programmeTitle} />
        <p className="mt-8 text-14 text-ink-muted">{fr.shell.placeholder.programmeBody}</p>
      </main>
    </AppShell>
  );
}
