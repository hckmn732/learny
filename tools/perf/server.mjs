// Démarrage et arrêt de `next start` pour les mesures (SPEC-804 ET-1, CL-2).
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const PERF_PORT = 3100;

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

async function healthy(base) {
  try {
    const response = await fetch(`${base}/api/v1/health`);
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

export async function waitForHealth(base, timeoutMs = 60_000) {
  // eslint-disable-next-line no-restricted-syntax -- outil hors application, pas de données personnelles
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-restricted-syntax
  while (Date.now() < deadline) {
    if (await healthy(base)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function startServer(env = process.env) {
  if (await portInUse()) {
    throw new Error(`Port ${PERF_PORT} déjà occupé : libérez-le avant de lancer test:perf.`);
  }
  const child = spawn('pnpm', ['--filter', '@learny/web', 'exec', 'node', 'server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, ...env, PORT: String(PERF_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[perf-server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[perf-server] ${chunk}`));
  const base = `http://127.0.0.1:${String(PERF_PORT)}`;
  if (!(await waitForHealth(base))) {
    child.kill('SIGTERM');
    throw new Error('Base locale ou serveur indisponible : /api/v1/health ne répond pas ok.');
  }
  return {
    base,
    stop: () =>
      new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
        setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 5000).unref();
      }),
  };
}
