// Error state of the agenda (SPEC-704 EF-13): the client component owns the retry through its
// query; the route-level file only catches a failure before the screen mounts.
'use client';

import { ErrorState } from '@learny/ui';

import { fr } from '../../../messages/fr';

export default function AgendaError() {
  return (
    <main className="mx-auto w-full max-w-content px-16 pb-56">
      <ErrorState
        className="mt-24 rounded-24 border border-solid border-border bg-surface"
        title={fr.agenda.errorTitle}
      />
    </main>
  );
}
