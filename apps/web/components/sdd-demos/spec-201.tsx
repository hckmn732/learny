'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ApiError, api } from '../../lib/api-client';
import { qk } from '../../lib/query-keys';
import { fr } from '../../messages/fr';
import { BaseCard, BaseTokenStyle } from '../sdd/base-tokens';

const t = fr.sdd.spec201;

const buttonClass =
  'rounded-[12px] bg-ink px-4 py-2 text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2';

const PAGE_SIZE = 20;

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return JSON.stringify(
      {
        code: error.code,
        status: error.status,
        requestId: error.requestId,
        ...(error.errors === undefined ? {} : { errors: error.errors }),
      },
      null,
      2,
    );
  }
  return String(error);
}

function ProblemCard({
  testId,
  title,
  intro,
  action,
  run,
}: Readonly<{
  testId: string;
  title: string;
  intro: string;
  action: string;
  run: () => Promise<unknown>;
}>) {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function click() {
    setBusy(true);
    try {
      await run();
      setResult('Réponse inattendue : aucune erreur.');
    } catch (error) {
      setResult(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BaseCard testId={testId} title={title}>
      <p className="mb-3 text-sm">{intro}</p>
      <button type="button" className={buttonClass} disabled={busy} onClick={() => void click()}>
        {action}
      </button>
      <div aria-live="polite" aria-busy={busy}>
        {busy ? <p className="mt-3 text-sm">{t.loading}</p> : null}
        {result === null ? null : (
          <pre
            data-testid={`${testId}-result`}
            className="mt-3 whitespace-pre-wrap break-words rounded-[12px] bg-canvas p-3 text-xs"
          >
            {result}
          </pre>
        )}
      </div>
    </BaseCard>
  );
}

interface IdempotencyLine {
  status: number;
  counter: number;
  replayed: boolean;
}

function Idempotency() {
  const [message, setMessage] = useState<string>(t.idempotency.defaultMessage);
  const [lines, setLines] = useState<IdempotencyLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    const key = crypto.randomUUID();
    const collected: IdempotencyLine[] = [];
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let status = 0;
        let replayed = false;
        const spy: typeof fetch = async (input, init) => {
          const response = await fetch(input, init);
          status = response.status;
          replayed = response.headers.get('idempotent-replayed') === 'true';
          return response;
        };
        const output = await api.devEcho(
          { body: { message } },
          { idempotencyKey: key, fetch: spy },
        );
        collected.push({ status, counter: output.counter, replayed });
      }
      setLines(collected);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  const labels = [t.idempotency.first, t.idempotency.second];
  return (
    <BaseCard testId="demo-idempotency" title={t.idempotency.title}>
      <p className="mb-3 text-sm">{t.idempotency.intro}</p>
      <label htmlFor="demo-idem-message" className="block text-sm font-semibold">
        {t.idempotency.label}
      </label>
      <input
        id="demo-idem-message"
        type="text"
        value={message}
        maxLength={200}
        onChange={(event) => {
          setMessage(event.target.value);
        }}
        className="mb-3 mt-1 w-full rounded-[12px] border border-solid border-border px-3 py-2"
      />
      <button
        type="button"
        className={buttonClass}
        disabled={busy || message.trim() === ''}
        onClick={() => void send()}
      >
        {t.idempotency.action}
      </button>
      <div aria-live="polite" aria-busy={busy}>
        {error === null ? null : (
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs">{error}</pre>
        )}
        <ul className="mt-3 space-y-1 text-sm">
          {lines.map((line, index) => (
            <li
              key={labels[index]}
              data-testid={index === 0 ? 'demo-idem-first' : 'demo-idem-second'}
            >
              {`${labels[index] ?? ''} : statut ${String(line.status)} · counter ${String(line.counter)} · ${t.idempotency.replayed} : ${line.replayed ? t.idempotency.yes : t.idempotency.no}`}
            </li>
          ))}
        </ul>
      </div>
    </BaseCard>
  );
}

function Pagination() {
  const query = useInfiniteQuery({
    queryKey: qk.devItems(),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.devItems({
        query: pageParam === null ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, cursor: pageParam },
      }),
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <BaseCard testId="demo-pagination" title={t.pagination.title}>
      <p className="mb-3 text-sm">{t.pagination.intro}</p>
      <div aria-live="polite" aria-busy={query.isFetching}>
        {query.isPending ? <p className="text-sm">{t.loading}</p> : null}
        {query.isError ? (
          <div>
            <p className="text-sm">{describeError(query.error)}</p>
            <button type="button" className={buttonClass} onClick={() => void query.refetch()}>
              {t.retry}
            </button>
          </div>
        ) : null}
        {items.length > 0 ? (
          <>
            <p data-testid="demo-pagination-count" className="text-sm font-semibold">
              {t.pagination.loaded(items.length)}
            </p>
            <ul data-testid="demo-pagination-list" className="mt-2 grid grid-cols-4 gap-1 text-sm">
              {items.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ul>
          </>
        ) : null}
        {query.hasNextPage ? (
          <button
            type="button"
            className={`${buttonClass} mt-3`}
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t.pagination.next}
          </button>
        ) : items.length > 0 ? (
          <p data-testid="demo-pagination-done" className="mt-3 text-sm">
            {t.pagination.done}
          </p>
        ) : null}
      </div>
    </BaseCard>
  );
}

function OpenApi() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/openapi.json')
      .then((response) => response.json() as Promise<{ paths: Record<string, object> }>)
      .then((document) => {
        if (active) {
          setCount(
            Object.values(document.paths).reduce(
              (total, item) => total + Object.keys(item).length,
              0,
            ),
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <BaseCard testId="demo-openapi" title={t.openapi.title}>
      <p className="mb-3 text-sm">{t.openapi.intro}</p>
      <p data-testid="demo-openapi-count" aria-live="polite" className="text-sm font-semibold">
        {count === null ? t.loading : t.openapi.routes(count)}
      </p>
      <a href="/openapi.json" className="mt-3 inline-block text-sm text-indigo-ink underline">
        {t.openapi.link}
      </a>
    </BaseCard>
  );
}

export default function Spec201Demo() {
  return (
    <>
      <BaseTokenStyle />
      <ProblemCard
        testId="demo-validation"
        title={t.validation.title}
        intro={t.validation.intro}
        action={t.validation.action}
        run={() => api.devEcho({ body: { message: '' } })}
      />
      <ProblemCard
        testId="demo-business"
        title={t.business.title}
        intro={t.business.intro}
        action={t.business.action}
        run={() => api.devEcho({ body: { message: 'démonstration', fail: 'business' } })}
      />
      <Idempotency />
      <Pagination />
      <OpenApi />
    </>
  );
}
