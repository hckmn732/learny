'use client';

import { ErrorState } from '@learny/ui';

import { fr } from '../../../../../messages/fr';

/** Error boundary of SCR-17: the same accessible state as a failed server read. */
export default function GroupError({ reset }: { reset: () => void }) {
  return (
    <main
      className="mx-auto w-full max-w-content px-16 pb-40 shell:px-40"
      data-testid="group-error-state"
    >
      <ErrorState
        description={fr.group.errorDescription}
        onRetry={reset}
        title={fr.group.errorTitle}
      />
    </main>
  );
}
