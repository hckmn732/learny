import { PageHeader, Skeleton, SkeletonGroup, SkeletonStatRow, SkeletonText } from '@learny/ui';

import { fr } from '../../../../../messages/fr';

const t = fr.gaps;

/**
 * Loading state of SCR-13 (SPEC-615 §10): the heading and the skeleton keep the three statistics,
 * the filters and the cards in place. No figure from a previous read is displayed.
 */
export default function LacunesLoading() {
  return (
    <main
      data-testid="gaps-loading"
      aria-busy="true"
      className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
    >
      <PageHeader eyebrow={t.title} title={t.title} />
      <p role="status" aria-live="polite" className="mt-20 text-14 text-ink-muted">
        {t.loading}
      </p>
      <div className="mt-16 flex flex-col gap-24">
        <SkeletonStatRow />
        <div className="flex flex-wrap gap-8">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-40 w-120 rounded-full" />
          ))}
        </div>
        <SkeletonGroup label={t.loading}>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex flex-col gap-12 rounded-24 border border-solid border-border bg-surface p-22"
            >
              <Skeleton className="h-20 w-220 rounded-full" />
              <SkeletonText lines={1} className="w-1/2" />
              <SkeletonText lines={2} />
            </div>
          ))}
        </SkeletonGroup>
      </div>
    </main>
  );
}
