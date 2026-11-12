import { PageHeader } from '@learny/ui';

import { AppShell } from '../../../components/shell/app-shell';
import { loadSidebarPage } from '../../../lib/sidebar-page';
import { fr } from '../../../messages/fr';

export const dynamic = 'force-dynamic';

// SPEC-304 mounts the application shell on the route of SCR-03. The home content itself is
// delivered by SPEC-603; this page only proves the shell integration.
export default async function AccueilPage() {
  const sidebar = await loadSidebarPage();
  return (
    <AppShell sidebar={sidebar.ok ? sidebar.data : null} sidebarError={!sidebar.ok}>
      <main className="mx-auto w-full max-w-content px-16 pt-64 pb-40 shell:px-40 shell:pt-28">
        <PageHeader title={fr.shell.placeholder.accueilTitle} />
        <p className="mt-8 text-14 text-ink-muted">{fr.shell.placeholder.accueilBody}</p>
      </main>
    </AppShell>
  );
}
