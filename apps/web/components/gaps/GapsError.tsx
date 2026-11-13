'use client';

import { useRouter } from 'next/navigation';

import { ErrorState } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.gaps;

export interface GapsErrorProps {
  requestId?: string | undefined;
}

/** Distinct error state of SCR-13 (SPEC-615 §10): retry reloads the server page, reference kept. */
export function GapsError({ requestId }: GapsErrorProps) {
  const router = useRouter();
  return (
    <ErrorState
      data-testid="gaps-error"
      title={t.errorTitle}
      description={t.errorDescription}
      {...(requestId === undefined ? {} : { requestId })}
      onRetry={() => {
        router.refresh();
      }}
    />
  );
}
