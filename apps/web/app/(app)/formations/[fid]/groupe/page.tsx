import { PageHeader } from '@learny/ui';

import { CreateGroupCard } from '../../../../../components/group/CreateGroupCard';
import { GroupActions } from '../../../../../components/group/GroupActions';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadGroupPage } from '../../../../../lib/group-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

interface GroupPageProps {
  params: Promise<{ fid: string }>;
}

const t = fr.group;

/**
 * SCR-17 — `/formations/[fid]/groupe` (SPEC-724 EF-1 to EF-4, BR-GRP-01 to BR-GRP-05).
 *
 * The group page shows the code, the ten-seat capacity and the four public facts of each member.
 * The owner can rotate the code and remove a member; a member can leave and keeps an individual
 * copy. A formation of another learner is a 404 before any content is rendered.
 */
export default async function GroupPage({ params }: GroupPageProps) {
  const { fid } = await params;
  const { shell, state } = await loadGroupPage(fid);

  return (
    <AppShell
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
    >
      <main
        className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
        data-testid="group-page"
      >
        <PageHeader eyebrow={state.formationTitle} title={t.title} />
        <div className="mt-24">
          {state.group === null ? (
            state.canCreate ? (
              <CreateGroupCard formationId={state.formationId} />
            ) : (
              <p
                className="m-0 rounded-16 border border-solid border-border bg-surface px-16 py-14 text-14 text-ink-muted"
                data-testid="group-read-only"
              >
                {t.readOnly}
              </p>
            )
          ) : (
            <GroupActions group={state.group} />
          )}
        </div>
      </main>
    </AppShell>
  );
}
