// Démarrage et arrêt de `next start` pour les mesures (SPEC-804 ET-1, CL-2).
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PERF_PORT = 3100;
export const PERF_API_PORT = PERF_PORT + 1;

export function portInUse(port = PERF_PORT) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function healthy(base, path = '/api/v1/health') {
  try {
    const response = await fetch(`${base}${path}`);
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === 'ok' || (path === '/health' && response.status === 200);
  } catch {
    return false;
  }
}

export async function waitForHealth(base, timeoutMs = 60_000, path = '/api/v1/health') {
  // eslint-disable-next-line no-restricted-syntax -- outil hors application, pas de données personnelles
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-restricted-syntax
  while (Date.now() < deadline) {
    if (await healthy(base, path)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function startServer(env = process.env) {
  if ((await portInUse()) || (await portInUse(PERF_API_PORT))) {
    throw new Error(
      `Ports ${PERF_PORT}/${PERF_API_PORT} déjà occupés : libérez-les avant de lancer test:perf.`,
    );
  }
  const commonEnv = {
    ...process.env,
    // ADR-4007: web and facade derive the same relay secret from the same master key.
    APP_ENCRYPTION_KEY:
      process.env.APP_ENCRYPTION_KEY || 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=', // learny-test-only
    ...env,
  };
  // The Python facade serves every operation (ADR-2001, ADR-2005): no TypeScript runtime left.
  const api = spawn(
    'uv',
    [
      'run',
      'uvicorn',
      'learny_api.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(PERF_API_PORT),
    ],
    {
      cwd: ROOT,
      env: { ...commonEnv, PORT: String(PERF_API_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const child = spawn('pnpm', ['--filter', '@learny/web', 'exec', 'node', 'server.mjs'], {
    cwd: ROOT,
    env: {
      ...commonEnv,
      PORT: String(PERF_PORT),
      API_INTERNAL_URL: `http://127.0.0.1:${String(PERF_API_PORT)}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  api.stdout.on('data', (chunk) => process.stdout.write(`[perf-api] ${chunk}`));
  api.stderr.on('data', (chunk) => process.stderr.write(`[perf-api] ${chunk}`));
  child.stdout.on('data', (chunk) => process.stdout.write(`[perf-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[perf-server] ${chunk}`));
  const apiBase = `http://127.0.0.1:${String(PERF_API_PORT)}`;
  const base = `http://127.0.0.1:${String(PERF_PORT)}`;
  if (!(await waitForHealth(apiBase, 60_000, '/health'))) {
    api.kill('SIGTERM');
    child.kill('SIGTERM');
    throw new Error('API locale indisponible : /api/v1/health ne répond pas ok.');
  }
  if (!(await waitForHealth(base))) {
    api.kill('SIGTERM');
    child.kill('SIGTERM');
    throw new Error('Base locale ou serveur indisponible : /api/v1/health ne répond pas ok.');
  }
  return {
    base,
    stop: () =>
      new Promise((resolve) => {
        let remaining = 2;
        const stopped = () => {
          remaining -= 1;
          if (remaining === 0) resolve();
        };
        for (const process of [child, api]) {
          process.once('exit', stopped);
          process.kill('SIGTERM');
          setTimeout(() => {
            process.kill('SIGKILL');
            stopped();
          }, 5000).unref();
        }
      }),
  };
}
