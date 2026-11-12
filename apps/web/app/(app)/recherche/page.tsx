import { SearchPageView } from '../../../components/search/search-results';
import { AppShell } from '../../../components/shell/app-shell';
import { loadSearchPage } from '../../../lib/search-page';
import { loadShellPage } from '../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

interface RecherchePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * SCR-18 — `/recherche?q=` (SPEC-307 EF-3, ET-3; BR-NAV-05).
 *
 * The query is read on the server and runs the same SPEC-212 service as the header field: a
 * direct URL gives exactly the results of a typed search, grouped Notions, Chapitres, Formations,
 * with the deep links validated by the contract.
 */
export default async function RecherchePage({ searchParams }: RecherchePageProps) {
  const params = await searchParams;
  const raw = params.q;
  const rawQuery = typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : '';
  const [shell, state] = await Promise.all([loadShellPage(), loadSearchPage(rawQuery)]);

  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <main
        data-testid="search-page"
        className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      >
        <SearchPageView state={state} />
      </main>
    </AppShell>
  );
}
