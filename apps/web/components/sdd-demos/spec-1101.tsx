import { headers } from 'next/headers';

import { createApiClient } from '@learny/api-client';
import { ROUTES } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/sdd';
import { Card, CardHeader, ScrollableTable } from '@learny/ui';

const t = fr.sdd.spec1101;
const cell = 'px-3 py-2 align-top';

async function fetchAt(origin: string, input: RequestInfo | URL, init?: RequestInit) {
  const value = input instanceof Request ? input.url : input;
  return fetch(new URL(value, origin), { cache: 'no-store', ...init });
}

async function callHealth(origin: string) {
  const client = createApiClient({
    baseUrl: `${origin}/api/v1`,
    fetch: (input, init) => fetchAt(origin, input, init),
  });
  return client.callApi(ROUTES.health, {}, { networkRetries: 0 });
}

export default async function Spec1101Demo() {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const webOrigin = `${protocol}://${host}`;
  const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';

  let health: Awaited<ReturnType<typeof callHealth>> | null = null;
  let webHealth: Awaited<ReturnType<typeof callHealth>> | null = null;
  let coverage: {
    registry: number;
    standard: number;
    specials: number;
    uncovered: string[];
  } | null = null;
  try {
    [health, webHealth] = await Promise.all([callHealth(apiOrigin), callHealth(webOrigin)]);
    const response = await fetchAt(apiOrigin, ROUTES.devSddApiCoverage.path);
    if (response.ok) {
      coverage = (await response.json()) as {
        registry: number;
        standard: number;
        specials: number;
        uncovered: string[];
      };
    }
  } catch {
    health = null;
  }
  const parity = JSON.stringify(webHealth) === JSON.stringify(health) && health !== null;

  return (
    <>
      <Card className="mt-6" data-testid="spec-1101-health" labelledBy="spec-1101-health-title">
        <CardHeader title={t.health.title} titleId="spec-1101-health-title" />
        {health === null ? (
          <p className="mt-4 text-danger" role="alert">
            {t.unavailable}
          </p>
        ) : (
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-13 text-ink-secondary">{t.health.status}</dt>
              <dd className="font-600" data-testid="spec-1101-status">
                {health.status}
              </dd>
            </div>
            <div>
              <dt className="text-13 text-ink-secondary">{t.health.version}</dt>
              <dd className="font-mono" data-testid="spec-1101-version">
                {health.version}
              </dd>
            </div>
            <div>
              <dt className="text-13 text-ink-secondary">{t.health.commit}</dt>
              <dd className="font-mono" data-testid="spec-1101-commit">
                {health.commit}
              </dd>
            </div>
          </dl>
        )}
      </Card>

      <Card className="mt-6" data-testid="spec-1101-coverage" labelledBy="spec-1101-coverage-title">
        <CardHeader title={t.coverage.title} titleId="spec-1101-coverage-title" />
        <div className="mt-4">
          <ScrollableTable label={t.coverage.region}>
            <table className="w-full min-w-[20rem] text-left text-13">
              <caption className="sr-only">{t.coverage.region}</caption>
              <thead>
                <tr>
                  {t.coverage.columns.map((column) => (
                    <th key={column} scope="col" className={cell}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [t.coverage.registry, coverage?.registry],
                  [
                    t.coverage.served,
                    coverage === null ? undefined : coverage.registry - coverage.uncovered.length,
                  ],
                  [t.coverage.specials, coverage?.specials],
                ].map(([label, value]) => (
                  <tr key={label} className="border-t border-border">
                    <th scope="row" className={cell}>
                      {label}
                    </th>
                    <td className={`${cell} font-mono`} data-testid="spec-1101-coverage-value">
                      {value ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      </Card>

      <Card className="mt-6" data-testid="spec-1101-parity" labelledBy="spec-1101-parity-title">
        <CardHeader title={t.parity.title} titleId="spec-1101-parity-title" />
        <p className="mt-4">
          {t.parity.label}
          {'\u00a0: '}
          <strong data-testid="spec-1101-parity-value">
            {parity ? t.parity.yes : t.parity.no}
          </strong>
        </p>
      </Card>
    </>
  );
}
