// Self-hosted job worker (ADR-0017): Hono serves the same Inngest registry as apps/web.
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createAdaptorServer } from '@hono/node-server';
import { Hono } from 'hono';
import type { Inngest } from 'inngest';
import { serve } from 'inngest/hono';

import { parseServerEnv } from '@learny/config/server';
import type { ErrorReporter } from '@learny/core';
import { resolveRequestId, REQUEST_ID_HEADER } from '@learny/core/server';
import {
  createFunctions,
  functions as sharedFunctions,
  inngest,
  sddDemoStore,
  setJobErrorReporter,
} from '@learny/jobs';

import { createWorkerReporter, initWorkerSentry } from './sentry';

export const DEFAULT_PORT = 3001;
export const INNGEST_PATH = '/api/inngest';

type Env = Readonly<Record<string, string | undefined>>;

export interface WorkerHealth {
  status: 'ok';
  version: string;
  commit: string;
}

// Only build identifiers that match a safe shape are exposed (EF-3).
export function getWorkerHealth(env: Env = process.env): WorkerHealth {
  const version = env.APP_VERSION ?? '';
  const commit = env.GIT_COMMIT ?? '';
  return {
    status: 'ok',
    version: /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/.test(version) ? version : 'dev',
    commit: /^[0-9a-f]{7,40}$/i.test(commit) ? commit : 'unknown',
  };
}

export interface AppOptions {
  client?: Inngest;
  functions?: Parameters<typeof serve>[0]['functions'];
  env?: Env;
  /** Telemetry sink of unexpected worker/job failures (SPEC-010, EF-3/EF-4). */
  reporter?: ErrorReporter;
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const client = options.client ?? inngest;
  // Final failures of the functions defined with `defineFunction` (SPEC-203 ET-4, SPEC-010).
  if (options.reporter !== undefined) {
    const reporter = options.reporter;
    setJobErrorReporter((report) => {
      reporter.capture(report.error, {
        route: `job:${report.job}`,
        ...(report.jobId === undefined ? {} : { jobId: report.jobId }),
        ...(report.userId === undefined ? {} : { userId: report.userId }),
      });
    });
  }
  const registry =
    options.functions ??
    (options.reporter === undefined
      ? sharedFunctions
      : createFunctions(client, {
          demoStore: sddDemoStore,
          reportError: (report) => {
            options.reporter?.capture(report.error, {
              ...(report.requestId === undefined ? {} : { requestId: report.requestId }),
              ...(report.jobId === undefined ? {} : { jobId: report.jobId }),
            });
          },
        }));
  const handler = serve({ client, functions: registry });
  app.get('/health', (c) => {
    // Every API answer carries a safe correlation identifier (SPEC-010, EF-1/ET-3).
    const requestId = resolveRequestId(c.req.header(REQUEST_ID_HEADER));
    c.header(REQUEST_ID_HEADER, requestId);
    c.header('cache-control', 'no-store');
    return c.json(getWorkerHealth(options.env));
  });
  app.on(['GET', 'POST', 'PUT'], INNGEST_PATH, (c) => handler(c));
  // A route error stays a safe 500: no stack, no exception message (SPEC-010, EF-3).
  app.onError((error, c) => {
    options.reporter?.capture(error, { route: '/worker' });
    return c.json({ status: 'error', code: 'INTERNAL_ERROR' }, 500);
  });
  return app;
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : ${value}`);
  }
  return port;
}

// Resolves once listening; rejects with a readable error if the port is taken (CL-7).
export function startServer(app: Hono, port: number, hostname = '0.0.0.0'): Promise<Server> {
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.close();
      reject(
        new Error(
          error.code === 'EADDRINUSE'
            ? `Le port ${String(port)} est déjà utilisé : le worker ne démarre pas.`
            : `Démarrage du worker impossible (${error.code ?? 'erreur inconnue'}).`,
        ),
      );
    };
    server.once('error', onError);
    server.listen(port, hostname, () => {
      server.off('error', onError);
      resolve(server);
    });
  });
}

export async function main(env: Env = process.env): Promise<void> {
  try {
    // Validated before any listener opens: an incomplete production environment never starts
    // (SPEC-009, EF-1). The error names variables only, never a value.
    const config = parseServerEnv(env);
    const port = parsePort(env.PORT);
    // Telemetry is optional: either way the worker starts and serves requests (CL-3, CL-4).
    const reporter = createWorkerReporter(env);
    await initWorkerSentry(env);
    await startServer(createApp({ env, reporter }), port);
    console.info(
      `learny worker: http://localhost:${String(port)}${INNGEST_PATH} (${config.APP_ENV})`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Démarrage du worker impossible.');
    process.exit(1);
  }
}

const entry = process.argv[1];
if (entry !== undefined && fileURLToPath(import.meta.url) === entry) void main();
