import { PageHeader } from '@learny/ui';

import { AppShell } from '../../../components/shell/app-shell';
import { loadShellPage } from '../../../lib/sidebar-page';
import { fr } from '../../../messages/fr';

export const dynamic = 'force-dynamic';

// SPEC-304/305 mount the shell on the route of SCR-03. The home content itself is delivered by
// SPEC-603; this page only proves the shell integration.
export default async function AccueilPage() {
  const shell = await loadShellPage();
  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <main className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40">
        <PageHeader title={fr.shell.placeholder.accueilTitle} />
        <p className="mt-8 text-14 text-ink-muted">{fr.shell.placeholder.accueilBody}</p>
      </main>
    </AppShell>
  );
}
