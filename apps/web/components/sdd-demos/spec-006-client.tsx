'use client';

import { useState } from 'react';

import { HealthResponse } from '@learny/contracts';
import { AppError, isAppError } from '@learny/core';

import { apiFetch } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.sdd.spec006.client;

const buttonClass =
  'rounded-[8px] bg-[#111113] px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

// Transport simulating an API answering with a problem+json error (RFC 9457).
const problemFetch: typeof fetch = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'Module verrouillé',
        status: 422,
        detail: t.problemDetail,
        code: 'MODULE_LOCKED',
        requestId: 'req-spec006-demo',
      }),
      { status: 422, headers: { 'content-type': 'application/problem+json' } },
    ),
  );

type Result =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; body: HealthResponse }
  | { kind: 'error'; code: string; detail: string; requestId: string | undefined };

function Crash(): never {
  throw new AppError('INTERNAL_ERROR', t.crashDetail, { requestId: 'req-spec006-page' });
}

export function Spec006Client() {
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [crash, setCrash] = useState(false);

  async function call(transport?: typeof fetch) {
    setResult({ kind: 'pending' });
    try {
      const body = await apiFetch({
        method: 'GET',
        path: '/health',
        output: HealthResponse,
        ...(transport === undefined ? {} : { fetch: transport }),
      });
      setResult({ kind: 'success', body });
    } catch (error) {
      const e = isAppError(error) ? error : new AppError('INTERNAL_ERROR', String(error));
      setResult({ kind: 'error', code: e.code, detail: e.detail, requestId: e.requestId });
    }
  }

  return (
    <>
      {crash ? <Crash /> : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="spec-006-client-success"
          className={buttonClass}
          disabled={result.kind === 'pending'}
          onClick={() => void call()}
        >
          {t.success}
        </button>
        <button
          type="button"
          data-testid="spec-006-client-problem"
          className={buttonClass}
          disabled={result.kind === 'pending'}
          onClick={() => void call(problemFetch)}
        >
          {t.problem}
        </button>
        <button
          type="button"
          data-testid="spec-006-client-crash"
          className={buttonClass}
          onClick={() => {
            setCrash(true);
          }}
        >
          {t.crash}
        </button>
      </div>
      <div
        data-testid="spec-006-client-result"
        role="status"
        aria-live="polite"
        className="mt-4 font-mono text-sm"
      >
        {result.kind === 'idle' ? <p>{t.idle}</p> : null}
        {result.kind === 'pending' ? <p>{t.pending}</p> : null}
        {result.kind === 'success' ? (
          <p>{t.succeeded(result.body.status, result.body.database)}</p>
        ) : null}
        {result.kind === 'error' ? (
          <>
            <p>{t.failed(result.code, result.detail)}</p>
            {result.requestId === undefined ? null : (
              <p>{`${t.requestId} : ${result.requestId}`}</p>
            )}
          </>
        ) : null}
      </div>
    </>
  );
}
