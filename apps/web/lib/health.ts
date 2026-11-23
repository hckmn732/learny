import {
  HealthResponse,
  type ComponentStatus,
  type DatabaseStatus,
} from '@learny/contracts/health';

export type DatabaseQuery = (signal: AbortSignal) => Promise<unknown>;
export const HEALTH_PROBE_TIMEOUT_MS = 2000;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;
const DATABASE_QUERY_KEY = Symbol.for('learny.health.databaseQuery');
type HealthRegistry = { [DATABASE_QUERY_KEY]?: DatabaseQuery | null };

function registeredQuery(): DatabaseQuery | null {
  return (globalThis as HealthRegistry)[DATABASE_QUERY_KEY] ?? null;
}

export function setDatabaseQuery(query: DatabaseQuery | null): void {
  (globalThis as HealthRegistry)[DATABASE_QUERY_KEY] = query;
}

export interface HealthOptions {
  query?: DatabaseQuery | null;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}
export interface HealthResult {
  httpStatus: 200 | 503;
  body: HealthResponse;
}

export async function probeDatabase(
  query: DatabaseQuery | null,
  timeoutMs = HEALTH_PROBE_TIMEOUT_MS,
): Promise<DatabaseStatus> {
  if (query === null) return 'not_configured';
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DatabaseStatus>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('unavailable');
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => query(controller.signal))
        .then(
          (): DatabaseStatus => 'ok',
          (): DatabaseStatus => 'unavailable',
        ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function buildInfo(env: Record<string, string | undefined> = process.env): {
  version: string;
  commit: string;
} {
  const version = env.APP_VERSION ?? '';
  const commit = (env.GIT_COMMIT ?? '').toLowerCase();
  return {
    version: VERSION_PATTERN.test(version) ? version : 'dev',
    commit: COMMIT_PATTERN.test(commit) ? commit : 'unknown',
  };
}

export async function getHealth(options: HealthOptions = {}): Promise<HealthResult> {
  const query = options.query === undefined ? registeredQuery() : options.query;
  const database = await probeDatabase(query, options.timeoutMs);
  const build = buildInfo(options.env);
  const body = HealthResponse.parse({
    status: database === 'ok' ? 'ok' : 'degraded',
    ...build,
    database,
    components: { database, build: buildStatus(build) },
  });
  return { httpStatus: database === 'unavailable' ? 503 : 200, body };
}

const DEFAULT_API_INTERNAL_URL = 'http://127.0.0.1:3001';

/**
 * SPEC-1203 — the web is a pure client without database access: the health it shows is the API's,
 * read on its public route. An unreachable API is reported as `unavailable`, never as `ok`.
 */
export async function readApiHealth(
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<HealthResult> {
  const origin = env.API_INTERNAL_URL ?? DEFAULT_API_INTERNAL_URL;
  try {
    const response = await fetcher(new URL('/api/v1/health', origin), { cache: 'no-store' });
    const body = HealthResponse.parse(await response.json());
    return { httpStatus: response.status === 503 ? 503 : 200, body };
  } catch {
    const build = buildInfo(env);
    return {
      httpStatus: 503,
      body: HealthResponse.parse({
        status: 'degraded',
        ...build,
        database: 'unavailable',
        components: { database: 'unavailable', build: buildStatus(build) },
      }),
    };
  }
}

export function buildStatus(build: { version: string; commit: string }): ComponentStatus {
  return build.version === 'dev' || build.commit === 'unknown' ? 'not_configured' : 'ok';
}

export const HEALTH_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
} as const;

export async function healthResponse(options: HealthOptions = {}): Promise<Response> {
  const { httpStatus, body } = await getHealth(options);
  return new Response(JSON.stringify(body), { status: httpStatus, headers: HEALTH_HEADERS });
}
