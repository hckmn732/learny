import { PageHeader } from '@learny/ui';

import { fr } from '../../../messages/fr';

const t = fr.search.page;

/**
 * Loading state of SCR-18 (SPEC-307 EF-5, ET-5): the French heading and skeleton cards keep the
 * page structure while the server search runs. No result from a previous query is shown.
 */
export default function RechercheLoading() {
  return (
    <main
      data-testid="search-page-loading"
      aria-busy="true"
      className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
    >
      <PageHeader eyebrow={t.eyebrow} title={t.title} />
      <p className="mt-20 text-14 text-ink-muted">{fr.search.loading}</p>
      <div className="mt-16 flex flex-col gap-16">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            aria-hidden="true"
            className="h-104 w-full animate-pulse rounded-24 border border-solid border-border bg-surface motion-reduce:animate-none"
          />
        ))}
      </div>
    </main>
  );
}
