'use client';

import { useEffect } from 'react';

import { Button, Card, Link, PageHeader } from '@learny/ui';

import { logClientError, safeErrorInfo } from '../../lib/client-log';
import { fr } from '../../messages/fr';

const t = fr.system.error;

/**
 * Safe error screen (SPEC-308 EF-2): a French message, a retry action and a way home; never a
 * stack, a table name, an internal URL, a secret or a submission. Next passes the boundary prop
 * as `reset`; one activation calls it exactly once (CA-2).
 */
export function ErrorView({ error, reset }: Readonly<{ error: unknown; reset: () => void }>) {
  const info = safeErrorInfo(error);
  useEffect(() => {
    logClientError(error);
  }, [error]);

  return (
    <main
      className="mx-auto flex min-h-[70vh] w-full max-w-[52rem] flex-col justify-center gap-24 px-24 py-56"
      data-testid="system-error"
    >
      <PageHeader eyebrow={fr.system.eyebrow} title={t.title} />
      <Card className="w-full" data-testid="system-error-card">
        <div role="alert">
          <p className="m-0 text-15 leading-1.55 text-ink-muted">{t.body}</p>
          {info.requestId === undefined ? null : (
            <p
              className="mt-12 font-mono text-12 text-ink-muted"
              data-testid="system-error-request-id"
            >
              {`${t.requestId} : ${info.requestId}`}
            </p>
          )}
          <div className="mt-20 flex flex-wrap items-center gap-12">
            <Button data-testid="system-error-retry" onClick={reset} size="lg" variant="dark">
              {t.retry}
            </Button>
            <Link href="/" variant="subtle" weight="semibold">
              {t.home}
            </Link>
          </div>
        </div>
      </Card>
    </main>
  );
}
