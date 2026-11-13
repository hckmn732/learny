import { HomeView } from '../../../components/home/home-view';
import { AppShell } from '../../../components/shell/app-shell';
import { loadHomePage } from '../../../lib/home-page';
import { loadShellPage } from '../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

interface AccueilPageProps {
  searchParams: Promise<{ onglet?: string | string[] }>;
}

/** SCR-03 — accueil of the connected learner (SPEC-603). */
export default async function AccueilPage({ searchParams }: AccueilPageProps) {
  const [shell, home, params] = await Promise.all([loadShellPage(), loadHomePage(), searchParams]);
  const raw = Array.isArray(params.onglet) ? params.onglet[0] : params.onglet;
  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <HomeView
        initialData={home.ok ? home.data : null}
        initialError={!home.ok}
        {...(home.ok || home.requestId === undefined ? {} : { requestId: home.requestId })}
        initialTab={raw === 'terminees' ? 'terminees' : 'en-cours'}
      />
    </AppShell>
  );
}
