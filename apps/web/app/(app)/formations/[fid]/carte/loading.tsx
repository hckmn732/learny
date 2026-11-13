import { PageHeader, Skeleton, SkeletonGroup, SkeletonText } from '@learny/ui';

import { fr } from '../../../../../messages/fr';

const t = fr.notionGraph;

/**
 * Loading state of SCR-14 (SPEC-616 §10): the heading, toolbar, dark canvas and detail panels keep
 * their place. No graph coordinate or figure from a previous read is displayed.
 */
export default function CarteLoading() {
  return (
    <main
      data-testid="notion-graph-loading"
      aria-busy="true"
      className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
    >
      <PageHeader eyebrow={t.title} title={t.title} />
      <p role="status" aria-live="polite" className="mt-20 text-14 text-ink-muted">
        {t.loading}
      </p>
      <div className="mt-16 flex flex-col gap-20">
        <div className="flex flex-wrap gap-8">
          <Skeleton className="h-42 w-300 rounded-12" />
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-36 w-120 rounded-full" />
          ))}
        </div>
        <div className="flex flex-wrap gap-20">
          <Skeleton className="h-[540px] min-w-0 flex-[999_1_560px] rounded-24 shell:h-[594px]" />
          <SkeletonGroup label={t.loading}>
            <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-16">
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface p-20"
                >
                  <Skeleton className="h-16 w-160 rounded-full" />
                  <SkeletonText lines={3} />
                </div>
              ))}
            </div>
          </SkeletonGroup>
        </div>
      </div>
    </main>
  );
}
