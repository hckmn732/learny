'use client';

import { useRouter } from 'next/navigation';

import { PageHeader, ErrorState } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.notionGraph;

export interface NotionGraphErrorProps {
  requestId?: string;
}

/** Distinct error state of SCR-14 (SPEC-616 §10): heading, explanation and a real retry. */
export function NotionGraphError({ requestId }: NotionGraphErrorProps) {
  const router = useRouter();
  return (
    <div data-testid="graph-error" className="flex flex-col gap-20">
      <PageHeader eyebrow={t.title} title={t.title} />
      <div className="rounded-24 border border-solid border-border bg-surface">
        <ErrorState
          title={t.errorTitle}
          description={t.errorDescription}
          {...(requestId === undefined ? {} : { requestId })}
          onRetry={() => {
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
