import { AppShell } from '../../../../../../components/shell/app-shell';
import { ResultScreen } from '../../../../../../components/simple/result-screen';
import { loadSimpleResultPage } from '../../../../../../lib/simple-page';

export const dynamic = 'force-dynamic';

interface SimpleResultPageProps {
  params: Promise<{ fid: string }>;
  searchParams: Promise<{ attempt?: string | string[] }>;
}

// SCR-24 — résultat du diagnostic et premier chapitre prêt (SPEC-4002 EF-7). La tentative est
// passée dans l'URL par l'écran de diagnostic : une page ouverte après « Passer le diagnostic »
// n'affiche pas de ligne de score.
export default async function SimpleResultPage({ params, searchParams }: SimpleResultPageProps) {
  const [{ fid }, query] = await Promise.all([params, searchParams]);
  const { shell, state, programme } = await loadSimpleResultPage(fid);
  const raw = Array.isArray(query.attempt) ? query.attempt[0] : query.attempt;
  const attemptId = typeof raw === 'string' && raw !== '' ? raw : null;
  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <ResultScreen attemptId={attemptId} fid={fid} programme={programme} state={state} />
    </AppShell>
  );
}
