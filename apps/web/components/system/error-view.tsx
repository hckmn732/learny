'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { logClientError, safeErrorInfo } from '../../lib/client-log';
import { fr } from '../../messages/fr';

const t = fr.system.error;

export const systemButtonClass =
  'rounded-[8px] bg-ink px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2';

/** Safe error screen: a French message, a retry action, a way home; never a stack or a detail. */
export function ErrorView({ error, retry }: Readonly<{ error: unknown; retry: () => void }>) {
  const info = safeErrorInfo(error);
  useEffect(() => {
    logClientError(error);
  }, [error]);

  return (
    <main data-testid="system-error" className="mx-auto max-w-2xl p-8">
      <h1 className="font-display text-3xl font-semibold">{t.title}</h1>
      <p className="mt-4">{t.body}</p>
      {info.requestId === undefined ? null : (
        <p data-testid="system-error-request-id" className="mt-2 font-mono text-sm">
          {`${t.requestId} : ${info.requestId}`}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          data-testid="system-error-retry"
          className={systemButtonClass}
          onClick={retry}
        >
          {t.retry}
        </button>
        <Link href="/" className="underline">
          {t.home}
        </Link>
      </div>
    </main>
  );
}
