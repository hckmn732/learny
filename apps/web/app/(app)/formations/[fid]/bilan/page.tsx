import { ErrorState } from '@learny/ui';

import { FinalReviewScreen } from '../../../../../components/final-review/FinalReviewScreen';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadFinalReviewPage } from '../../../../../lib/final-review-page';
import { loadShellPage } from '../../../../../lib/sidebar-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

const t = fr.finalReview;

interface BilanPageProps {
  params: Promise<{ fid: string }>;
}

/**
 * SCR-16 — `/formations/[fid]/bilan` (SPEC-617 EF-1 to EF-3; BR-FOR-12, BR-PRO-03).
 *
 * The server reads one snapshot under the learner's RLS session. A formation whose modules are not
 * all validated is redirected to its programme, and a foreign identifier is a 404 before any
 * content is rendered (ET-5, CA-4).
 */
export default async function BilanPage({ params }: BilanPageProps) {
  const { fid } = await params;
  const [shell, review] = await Promise.all([loadShellPage(), loadFinalReviewPage(fid)]);

  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <main
        data-testid="final-review-page"
        className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      >
        {review.ok ? (
          <FinalReviewScreen data={review.data} />
        ) : (
          <ErrorState
            className="mt-24 rounded-24 border border-solid border-border bg-surface"
            title={t.errorTitle}
            {...(review.requestId === undefined ? {} : { requestId: review.requestId })}
          />
        )}
      </main>
    </AppShell>
  );
}
