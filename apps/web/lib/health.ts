// Health of the web process and of its database (SPEC-006, EF-1/EF-2, ET-1).
import { HealthResponse, type ComponentStatus, type DatabaseStatus } from '@learny/contracts';

/**
 * Capability given to the probe: run one trivial query (e.g. `select 1`).
 * It never exposes a connection string; its result and error message are ignored.
 */
export type DatabaseQuery = (signal: AbortSignal) => Promise<unknown>;

export const HEALTH_PROBE_TIMEOUT_MS = 2000;

const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

// Wired by SPEC-101 once the database client exists. Until then the database is `not_configured`.
let registeredQuery: DatabaseQuery | null = null;

export function setDatabaseQuery(query: DatabaseQuery | null): void {
  registeredQuery = query;
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

/** Runs the probe with a bounded delay; any failure or timeout is `unavailable`, never an error message. */
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
  const probe = Promise.resolve()
    .then(() => query(controller.signal))
    .then(
      (): DatabaseStatus => 'ok',
      (): DatabaseStatus => 'unavailable',
    );
  try {
    return await Promise.race([probe, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Build metadata, restricted to safe formats so that no arbitrary value leaks through. */
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
  const query = options.query === undefined ? registeredQuery : options.query;
  const database = await probeDatabase(query, options.timeoutMs);
  const build = buildInfo(options.env);
  const body = HealthResponse.parse({
    status: database === 'ok' ? 'ok' : 'degraded',
    ...build,
    database,
    components: {
      database,
      build: buildStatus(build),
    },
  });
  return { httpStatus: database === 'unavailable' ? 503 : 200, body };
}

/**
 * Build component state (EF-5): the deployment identifiers are `not_configured` when they fall
 * back to their safe defaults, `ok` otherwise. No build probe can be `unavailable`.
 */
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
