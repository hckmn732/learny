import { SkeletonCard, SkeletonGroup } from '@learny/ui';

import { fr } from '../../../../../messages/fr';

const t = fr.finalReview;

/** Loading state of SCR-16 (SPEC-617 §10): skeleton cards announced once, no layout shift. */
export default function BilanLoading() {
  return (
    <main className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40">
      <SkeletonGroup className="mt-24 flex flex-col gap-20" label={t.loading}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </SkeletonGroup>
    </main>
  );
}
