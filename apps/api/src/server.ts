import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createAdaptorServer } from '@hono/node-server';
import type { Hono } from 'hono';

import { parseServerEnv } from '@learny/config/server';

import { createApp, DEFAULT_PORT } from './app';
import { createApiReporter, initApiSentry } from './sentry';

export { DEFAULT_PORT } from './app';

type Env = Readonly<Record<string, string | undefined>>;

export function parsePort(value: string | number | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const text = String(value);
  const port = Number(text);
  if (!/^\d+$/.test(text) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : ${text}`);
  }
  return port;
}

export function startServer(app: Hono, port: number, hostname = '0.0.0.0'): Promise<Server> {
  const server = createAdaptorServer({ fetch: app.fetch }) as Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.requestTimeout = 0;
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.close();
      reject(
        new Error(
          error.code === 'EADDRINUSE'
            ? `Le port ${String(port)} est déjà utilisé : l’API ne démarre pas.`
            : `Démarrage de l’API impossible (${error.code ?? 'erreur inconnue'}).`,
        ),
      );
    };
    server.once('error', onError);
    server.listen(port, hostname, () => {
      server.off('error', onError);
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => {
          server.close(() => process.exit(0));
        });
      }
      resolve(server);
    });
  });
}

export async function main(env: Env = process.env): Promise<void> {
  try {
    const config = parseServerEnv(env);
    const reporter = createApiReporter(env);
    await initApiSentry(env);
    const port = parsePort(env.PORT ?? config.API_PORT);
    await startServer(createApp({ env, reporter, role: config.LEARNY_API_ROLE }), port);
    console.info(
      `learny api: http://localhost:${String(port)} (${config.APP_ENV}, rôle ${config.LEARNY_API_ROLE})`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Démarrage de l’API impossible.');
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry !== undefined && fileURLToPath(import.meta.url) === entry) void main();
