'use client';

import { useState } from 'react';

import { ApiError } from '@learny/api-client';
import { fr } from '@learny/i18n/fr/sdd';
import { Button, Card, CardHeader, ScrollableTable } from '@learny/ui';

const t = fr.sdd.spec1003;
const cell = 'px-3 py-2 align-top';

type CaseId = 'valid' | 'invalid' | 'missing-key';
interface CaseResult {
  status: number;
  code: string;
  requestId: boolean;
}

const CASES = [
  { id: 'valid', label: t.cases.valid },
  { id: 'invalid', label: t.cases.invalid },
  { id: 'missing-key', label: t.cases.missingKey },
] as const;

async function runCase(id: CaseId): Promise<CaseResult> {
  const body = id === 'invalid' ? { message: '' } : { message: 'Démonstration de la couche HTTP' };
  const headers = new Headers({ 'content-type': 'application/json' });
  if (id !== 'missing-key') headers.set('idempotency-key', crypto.randomUUID());
  const response = await fetch('/api/v1/dev/sdd/echo', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { code?: string };
  return {
    status: response.status,
    code: payload.code ?? '—',
    requestId: Boolean(response.headers.get('x-request-id')),
  };
}

export default function Spec1003Demo() {
  const [results, setResults] = useState<Partial<Record<CaseId, CaseResult>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const entries = await Promise.all(
        CASES.map(async ({ id }) => [id, await runCase(id)] as const),
      );
      setResults(Object.fromEntries(entries));
    } catch (caught) {
      setError(caught instanceof ApiError ? `${caught.code} : ${caught.detail}` : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="mt-6 text-13 text-ink-secondary">{t.intro}</p>
      <Card
        className="mt-6"
        data-testid="spec-1003-transport"
        labelledBy="spec-1003-transport-title"
      >
        <CardHeader title={t.transport.title} titleId="spec-1003-transport-title" />
        <p className="mt-4 font-mono text-13" data-testid="spec-1003-origin">
          {t.transport.origin}
        </p>
        <Button
          type="button"
          className="mt-4"
          data-testid="spec-1003-run"
          disabled={busy}
          loading={busy}
          onClick={() => void run()}
        >
          {t.run}
        </Button>
        <div className="mt-4" aria-live="polite" aria-busy={busy}>
          <ScrollableTable label={t.cases.region}>
            <table className="w-full min-w-[24rem] text-left text-13" data-testid="spec-1003-cases">
              <caption className="sr-only">{t.cases.region}</caption>
              <thead>
                <tr>
                  {t.cases.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CASES.map((item) => {
                  const result = results[item.id];
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-border"
                      data-testid="spec-1003-case"
                    >
                      <th scope="row" className={cell}>
                        {item.label}
                      </th>
                      <td
                        className={`${cell} font-mono`}
                        data-testid={`spec-1003-status-${item.id}`}
                      >
                        {result?.status ?? '—'}
                      </td>
                      <td className={`${cell} font-mono`} data-testid={`spec-1003-code-${item.id}`}>
                        {result?.code ?? '—'}
                      </td>
                      <td className={cell} data-testid={`spec-1003-request-id-${item.id}`}>
                        {result === undefined ? '—' : result.requestId ? t.yes : t.no}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollableTable>
          {error === null ? null : (
            <p className="mt-3 text-13 text-error" data-testid="spec-1003-error">
              {error}
            </p>
          )}
        </div>
      </Card>
    </>
  );
}
