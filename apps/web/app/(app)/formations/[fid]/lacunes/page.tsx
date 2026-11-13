import { CircleCheck } from 'lucide-react';
import NextLink from 'next/link';

import { LEARNING_GAP_NATURES, type GapNature } from '@learny/contracts';
import { EmptyState, PageHeader } from '@learny/ui';

import { GapCard } from '../../../../../components/gaps/GapCard';
import { GapFilters } from '../../../../../components/gaps/GapFilters';
import { GapsError } from '../../../../../components/gaps/GapsError';
import { GapStats } from '../../../../../components/gaps/GapStats';
import { AppShell } from '../../../../../components/shell/app-shell';
import { loadGapsPage } from '../../../../../lib/gaps-page';
import { loadShellForFormation } from '../../../../../lib/sidebar-page';
import { fr } from '../../../../../messages/fr';

export const dynamic = 'force-dynamic';

const t = fr.gaps;

interface LacunesPageProps {
  params: Promise<{ fid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function requestedNature(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === undefined || raw === '' ? undefined : raw;
}

/**
 * SCR-13 — `/formations/[fid]/lacunes?nature=` (SPEC-615 EF-1 to EF-4; BR-LAC-05).
 *
 * The server reads one snapshot of the open gaps and renders the three statistics, the URL-backed
 * filter row and one card per gap. An unknown `nature` falls back to « Toutes » with a controlled
 * message (CL-4); a formation of another learner is a 404 before any content is rendered.
 */
export default async function LacunesPage({ params, searchParams }: LacunesPageProps) {
  const { fid } = await params;
  const query = await searchParams;
  const raw = requestedNature(query.nature);
  const valid = raw !== undefined && LEARNING_GAP_NATURES.includes(raw as GapNature);
  const nature = valid ? (raw as GapNature) : undefined;
  const invalidNature = raw !== undefined && !valid;

  const [shell, gaps] = await Promise.all([loadShellForFormation(fid), loadGapsPage(fid, nature)]);

  return (
    <AppShell
      sidebar={shell.sidebar.ok ? shell.sidebar.data : null}
      sidebarError={!shell.sidebar.ok}
      header={shell.header.ok ? shell.header.data : null}
      headerError={!shell.header.ok}
    >
      <main
        data-testid="gaps-page"
        className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      >
        {gaps.ok ? (
          <div data-testid="gaps-content" className="flex flex-col gap-24">
            <PageHeader
              eyebrow={gaps.data.formationTitle}
              title={t.title}
              actions={
                gaps.data.summary.openGaps === 0 ? undefined : (
                  <NextLink
                    data-testid="gaps-train-all"
                    prefetch={false}
                    href={`/formations/${encodeURIComponent(gaps.data.formationId)}/quiz-global?cible=lacunes`}
                    className="inline-flex min-h-48 items-center rounded-14 bg-lime px-20 text-15 font-700 text-ink no-underline transition-[filter] hover:brightness-95"
                  >
                    {t.trainAll}
                  </NextLink>
                )
              }
            />
            <GapStats
              summary={gaps.data.summary}
              nextReviewAt={gaps.data.nextReviewAt}
              generatedAt={gaps.data.generatedAt}
              timezone={gaps.data.timezone}
            />
            <GapFilters countsByNature={gaps.data.countsByNature} activeNature={gaps.data.nature} />
            {invalidNature ? (
              <p
                role="status"
                data-testid="gaps-invalid-nature"
                className="m-0 rounded-12 border border-solid border-border bg-surface px-14 py-10 text-13 text-ink-secondary"
              >
                {t.invalidNature}
              </p>
            ) : null}
            {gaps.data.items.length === 0 ? (
              <div
                data-testid="gaps-empty"
                className="rounded-24 border border-solid border-border bg-surface"
              >
                <EmptyState
                  icon={CircleCheck}
                  tone="lime"
                  title={t.empty.title}
                  description={t.empty.description}
                />
              </div>
            ) : (
              <ul aria-label={t.listLabel} className="m-0 flex list-none flex-col gap-12 p-0">
                {gaps.data.items.map((item) => (
                  <GapCard key={item.notionId} item={item} timezone={gaps.data.timezone} />
                ))}
              </ul>
            )}
            <p className="m-0 rounded-18 border border-solid border-border bg-surface px-18 py-16 text-14 leading-1.55 text-ink-muted">
              {t.note}
            </p>
          </div>
        ) : (
          <GapsError {...(gaps.requestId === undefined ? {} : { requestId: gaps.requestId })} />
        )}
      </main>
    </AppShell>
  );
}
