// Self-hosted job worker (ADR-0017): Hono serves the same Inngest registry as apps/web.
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createAdaptorServer } from '@hono/node-server';
import { Hono } from 'hono';
import type { Inngest } from 'inngest';
import { serve } from 'inngest/hono';

import { functions as sharedFunctions, inngest } from '@learny/jobs';

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
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const handler = serve({
    client: options.client ?? inngest,
    functions: options.functions ?? sharedFunctions,
  });
  app.get('/health', (c) => {
    c.header('cache-control', 'no-store');
    return c.json(getWorkerHealth(options.env));
  });
  app.on(['GET', 'POST', 'PUT'], INNGEST_PATH, (c) => handler(c));
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
    const port = parsePort(env.PORT);
    await startServer(createApp({ env }), port);
    console.info(`learny worker: http://localhost:${String(port)}${INNGEST_PATH}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Démarrage du worker impossible.');
    process.exit(1);
  }
}

const entry = process.argv[1];
if (entry !== undefined && fileURLToPath(import.meta.url) === entry) void main();
