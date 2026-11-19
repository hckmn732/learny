// Loading state of the agenda (SPEC-704 EF-13): skeletons of the sidebar cards and the grid.
import { fr } from '@learny/i18n/fr/agenda';
import { SkeletonCard, SkeletonGroup } from '@learny/ui';

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
