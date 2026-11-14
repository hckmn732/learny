import { PageHeader, Skeleton, SkeletonGroup, SkeletonText } from '@learny/ui';

import { fr } from '../../../../../messages/fr';

const t = fr.group;

/** Loading state of SCR-17: the heading and the group skeleton keep the layout stable. */
export default function GroupLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      data-testid="group-loading"
    >
      <PageHeader eyebrow={t.eyebrow} title={t.title} />
      <p aria-live="polite" className="mt-20 text-14 text-ink-muted" role="status">
        {t.loading}
      </p>
      <div className="mt-16 flex flex-col gap-24">
        <Skeleton className="h-160 rounded-24" />
        <SkeletonGroup label={t.loading}>
          <SkeletonText lines={4} />
        </SkeletonGroup>
      </div>
    </main>
  );
}
