// Loading state of the agenda (SPEC-704 EF-13): skeletons of the sidebar cards and the grid.
import { SkeletonCard, SkeletonGroup } from '@learny/ui';

import { fr } from '../../../messages/fr';

export default function AgendaLoading() {
  return (
    <main className="mx-auto w-full max-w-content px-16 pb-56">
      <SkeletonGroup className="mt-24 flex flex-col gap-20" label={fr.agenda.loading}>
        <SkeletonCard />
        <SkeletonCard />
      </SkeletonGroup>
    </main>
  );
}
