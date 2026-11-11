/* global AbortSignal */
// Shared helpers for the local development stack (SPEC-008, ET-3).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const COMPOSE_FILE = path.join('docker', 'compose.dev.yml');
export const REQUIRED_EXTENSIONS = ['vector', 'unaccent', 'pg_trgm', 'pgcrypto'];
export const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Ports and URLs of the local stack, read from a single place (ET-3). */
export const STACK = {
  supabaseApi: 54321,
  postgres: 54322,
  inngest: 8288,
  mailpitSmtp: 1025,
  mailpitUi: 8025,
  web: 3000,
};

export function serviceUrls(env = process.env) {
  return {
    supabase: `http://127.0.0.1:${String(STACK.supabaseApi)}`,
    postgres: `postgresql://127.0.0.1:${String(STACK.postgres)}/postgres`,
    inngest: `http://127.0.0.1:${String(STACK.inngest)}`,
    mailpit: env.MAILPIT_URL ?? `http://127.0.0.1:${String(STACK.mailpitUi)}`,
    web: env.NEXT_PUBLIC_APP_URL ?? `http://127.0.0.1:${String(STACK.web)}`,
  };
}

/** Minimal .env loader: never overrides an existing variable and never prints values. */
export function loadEnvFiles(files = ['.env.local', '.env']) {
  for (const file of files) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = (raw ?? '').replace(/^"(.*)"$/, '$1');
    }
  }
}

/** A reset is allowed only on an explicitly local database (ET-4, CL-5). */
export function databaseResetGuard(env = process.env) {
  const appEnv = (env.APP_ENV ?? 'local').toLowerCase();
  if (appEnv === 'production' || appEnv === 'preview') {
    return { ok: false, reason: `APP_ENV=${appEnv} interdit une remise à zéro` };
  }
  const value = env.DATABASE_URL;
  if (!value) return { ok: false, reason: 'DATABASE_URL est absente' };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'DATABASE_URL est invalide' };
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    return { ok: false, reason: `DATABASE_URL n'est pas une URL PostgreSQL` };
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    return {
      ok: false,
      reason: `DATABASE_URL pointe vers ${url.hostname}, pas vers une base locale`,
    };
  }
  return { ok: true, reason: `base locale autorisée (${url.hostname})` };
}

export function parsePort(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT invalide : ${String(value)}`);
  }
  return port;
}

export function hasCommand(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return result.status === 0 ? ((result.stdout ?? '').trim().split('\n')[0] ?? '') : null;
}

export function commandExists(command) {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
}

/** Runs a command with separate arguments and the caller's stdio (ET-3). */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  return result.status ?? 1;
}

export function runQuiet(command, args, options = {}) {
  return spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
}

/** Polls an HTTP endpoint with a bounded timeout and connection retries (ET-5). */
export async function waitForHttp(url, { timeoutMs = 60000, intervalMs = 500 } = {}) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let lastError = 'délai dépassé';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response;
      lastError = `HTTP ${String(response.status)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${url} indisponible : ${lastError}`);
}

export function dockerDiagnostic() {
  const result = runQuiet('docker', ['info']);
  if (result.status !== 0) {
    return `Docker est indisponible. Démarrez Docker Engine/Compose puis relancez.\n${(result.stderr ?? '').trim()}`;
  }
  return null;
}

export function supabaseDiagnostic() {
  if (!commandExists('supabase')) {
    return 'Supabase CLI est introuvable. Installez la CLI 2 (https://supabase.com/docs/guides/cli).';
  }
  return null;
}
