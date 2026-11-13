import { NotionGraphError } from '../../../../../components/notion-graph/NotionGraphError';
import { NotionGraphExperience } from '../../../../../components/notion-graph/NotionGraphExperience';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadNotionGraphPage } from '../../../../../lib/notion-graph-page';
import { loadShellForFormation } from '../../../../../lib/sidebar-page';

export const dynamic = 'force-dynamic';

interface CartePageProps {
  params: Promise<{ fid: string }>;
}

/**
 * SCR-14 — `/formations/[fid]/carte` (SPEC-616 EF-1 to EF-5; BR-CAR-01 to 05).
 *
 * The server reads one snapshot of the graph under the learner's RLS session and the shell in
 * parallel. Another learner's formation is a 404 before any content is rendered (CA-4); the SVG,
 * filters, search and detail panel are then entirely client-side.
 */
export default async function CartePage({ params }: CartePageProps) {
  const { fid } = await params;
  const [shell, graph] = await Promise.all([loadShellForFormation(fid), loadNotionGraphPage(fid)]);

  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <main
        data-testid="notion-graph-page"
        className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      >
        {graph.ok ? (
          <NotionGraphExperience graph={graph.data} />
        ) : (
          <NotionGraphError
            {...(graph.requestId === undefined ? {} : { requestId: graph.requestId })}
          />
        )}
      </main>
    </AppShell>
  );
}
