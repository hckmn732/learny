import { createHmac } from 'node:crypto';

import { ROUTES } from '@learny/contracts';
import { clock, systemClock } from '@learny/core';
import { Card, CardHeader, ScrollableTable } from '@learny/ui';

interface Scenario {
  name: string;
  expected: number;
  status: number;
  code: string;
}

const cell = 'px-3 py-2 align-top';
const DEMO_USER = '3b69c7a7-b1f5-597a-b199-999de11ffdfd';
const DEMO_EMAIL = 'alex.perrin@demo.learny.test';

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

interface DemoTokenTimes {
  /** `iat` of a live token: before both clocks, so that neither sees a future issue. */
  issuedAt: number;
  /** `exp` of a live token: after both clocks, the Auth server reading the real one. */
  expiresAt: number;
  /** `exp` of the deliberately expired token, before the API's injected clock. */
  expiredAt: number;
}

/**
 * A session cookie is checked by the Auth server (`GET /auth/v1/user` compares `exp` with the real
 * clock) while the API checks the same token with its injected clock (`CLOCK_FIXED_AT`, frozen at
 * 2026-11-11T12:20:00Z in tests, ADR-0047). A live demonstration token must satisfy both, so it is
 * minted from the latest of the two instants; the expired one is minted from the injected clock,
 * which is the clock that has to refuse it.
 */
function demoTokenTimes(): DemoTokenTimes {
  const injected = Math.floor(clock.now().getTime() / 1000);
  const real = Math.floor(systemClock.now().getTime() / 1000);
  return {
    issuedAt: Math.min(injected, real) - 5,
    expiresAt: Math.max(injected, real) + 3600,
    expiredAt: injected - 1,
  };
}

function signDemoToken(
  secret: string,
  issuer: string,
  times: { issuedAt: number; expiresAt: number },
): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      sub: DEMO_USER,
      aud: 'authenticated',
      iss: issuer,
      email: DEMO_EMAIL,
      iat: times.issuedAt,
      exp: times.expiresAt,
      role: 'authenticated',
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function demoCookie(
  supabaseUrl: string,
  accessToken: string,
  issuedAt: number,
  expiresAt: number,
): string {
  const ref = new URL(supabaseUrl).hostname.split('.')[0] ?? '127';
  const session = {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresAt - issuedAt,
    expires_at: expiresAt,
    refresh_token: 'learny-test-only-demo-refresh-token-never-used',
    user: {
      id: DEMO_USER,
      aud: 'authenticated',
      role: 'authenticated',
      email: DEMO_EMAIL,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
  return `sb-${ref}-auth-token=base64-${base64url(JSON.stringify(session))}`;
}

async function observe(
  name: string,
  expected: number,
  request: () => Promise<Response>,
): Promise<Scenario> {
  try {
    const response = await request();
    let code = '—';
    if (response.status >= 400) {
      const problem = (await response.json().catch(() => null)) as { code?: unknown } | null;
      if (typeof problem?.code === 'string') code = problem.code;
    }
    return { name, expected, status: response.status, code };
  } catch {
    return { name, expected, status: 503, code: 'SERVICE_UNAVAILABLE' };
  }
}

export default async function Spec1102Demo() {
  const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const proxySecret =
    process.env.API_PROXY_SECRET ??
    (process.env.APP_ENV === 'test' ? 'learny-test-only-api-proxy-secret-value' : undefined);
  const issuer = `${supabaseUrl?.replace(/\/$/, '') ?? ''}/auth/v1`;

  let scenarios: Scenario[];
  if (supabaseUrl === undefined || secret === undefined || proxySecret === undefined) {
    scenarios = (
      [
        ['Cookie de démonstration', 200],
        ['Bearer de démonstration', 200],
        ['Bearer expiré', 401],
        ['Mutation relayée avec secret', 200],
        ['Mutation relayée sans secret', 403],
      ] as const
    ).map(([name, expected]) => ({
      name,
      expected,
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
    }));
  } else {
    const times = demoTokenTimes();
    const token = signDemoToken(secret, issuer, times);
    const expired = signDemoToken(secret, issuer, {
      issuedAt: times.issuedAt,
      expiresAt: times.expiredAt,
    });
    const cookie = demoCookie(supabaseUrl, token, times.issuedAt, times.expiresAt);
    scenarios = await Promise.all([
      observe('Cookie de démonstration', 200, () =>
        fetch(new URL(ROUTES.meGet.path, apiOrigin), {
          cache: 'no-store',
          headers: { cookie },
        }),
      ),
      observe('Bearer de démonstration', 200, () =>
        fetch(new URL(ROUTES.meGet.path, apiOrigin), {
          cache: 'no-store',
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
      observe('Bearer expiré', 401, () =>
        fetch(new URL(ROUTES.meGet.path, apiOrigin), {
          cache: 'no-store',
          headers: { authorization: `Bearer ${expired}` },
        }),
      ),
      observe('Mutation relayée avec secret', 200, () =>
        fetch(new URL(ROUTES.devSddAuthProxy.path, apiOrigin), {
          method: 'POST',
          cache: 'no-store',
          headers: {
            origin: 'https://learny.example',
            host: 'api.internal',
            'x-learny-proxy-secret': proxySecret,
            'x-forwarded-host': 'learny.example',
            'x-forwarded-proto': 'https',
            'x-forwarded-for': '198.51.100.42',
          },
        }),
      ),
      observe('Mutation relayée sans secret, hôte différent', 403, () =>
        fetch(new URL(ROUTES.devSddAuthProxy.path, apiOrigin), {
          method: 'POST',
          cache: 'no-store',
          headers: {
            origin: 'https://learny.example',
            host: 'api.internal',
            'x-forwarded-host': 'learny.example',
            'x-forwarded-proto': 'https',
          },
        }),
      ),
    ]);
  }

  return (
    <Card className="mt-6" data-testid="spec-1102-scenarios" labelledBy="spec-1102-scenarios-title">
      <CardHeader title="Scénarios d’authentification" titleId="spec-1102-scenarios-title" />
      <ScrollableTable label="Scénarios d’authentification multi-clients">
        <table className="mt-4 w-full min-w-[38rem] text-left text-13">
          <caption className="sr-only">Résultats obtenus contre apps/api</caption>
          <thead>
            <tr>
              {['Scénario', 'Statut attendu', 'Statut obtenu', 'Code'].map((column) => (
                <th key={column} scope="col" className={cell}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenarios.map((scenario) => (
              <tr
                className="border-t border-border"
                data-testid="spec-1102-scenario"
                key={scenario.name}
              >
                <th scope="row" className={cell}>
                  {scenario.name}
                </th>
                <td className={`${cell} font-mono`}>{String(scenario.expected)}</td>
                <td className={`${cell} font-mono`} data-testid="spec-1102-observed-status">
                  {String(scenario.status)}
                </td>
                <td className={`${cell} font-mono`} data-testid="spec-1102-code">
                  {scenario.code}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollableTable>
      <form className="mt-4">
        <button className="button-primary" type="submit">
          Rejouer
        </button>
      </form>
    </Card>
  );
}
