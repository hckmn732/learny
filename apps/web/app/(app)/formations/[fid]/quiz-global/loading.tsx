import { Skeleton, SkeletonGroup } from '@learny/ui';

import { fr } from '../../../../../messages/fr';

const t = fr.globalQuiz;

/**
 * Loading state of SCR-10 (SPEC-701 EF-12): the header, the duration switch, the segmented
 * progress, the rail and the game card keep their place while the session is read or created.
 */
export default function QuizGlobalLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex w-full max-w-content flex-col gap-24 px-16 pb-40 shell:px-40"
      data-testid="gq-loading"
    >
      <p className="sr-only" role="status">
        {t.loading}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-16">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-14 w-320 rounded-full" />
          <Skeleton className="h-34 w-200 rounded-8" />
        </div>
        <div className="flex gap-8">
          <Skeleton className="h-34 w-90 rounded-full" />
          <Skeleton className="h-34 w-170 rounded-full" />
          <Skeleton className="h-34 w-80 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-40 w-460 rounded-12" />
      <div className="flex items-center gap-12">
        <Skeleton className="h-8 flex-1 rounded-4" />
        <Skeleton className="h-16 w-80 rounded-full" />
      </div>
      <div className="flex flex-wrap items-start gap-20">
        <SkeletonGroup label={t.loading}>
          <div className="flex flex-[1_1_260px] flex-col gap-16">
            <Skeleton className="h-356 w-full rounded-24" />
            <Skeleton className="h-190 w-full rounded-24" />
          </div>
        </SkeletonGroup>
        <SkeletonGroup label={t.loading}>
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-20 rounded-24 border border-solid border-border bg-surface p-28">
            <Skeleton className="h-28 w-260 rounded-8" />
            <Skeleton className="h-300 w-full rounded-22" />
          </div>
        </SkeletonGroup>
      </div>
    </main>
  );
}
