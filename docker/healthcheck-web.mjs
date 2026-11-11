#!/usr/bin/env node
/* global AbortSignal */
// Container healthcheck of the web image (SPEC-012, EF-5, CL-2).
//
// It runs inside the web container and fails when a mandatory dependency is unreachable, so the
// Compose stack never presents `web` as healthy while the database, Supabase API or Inngest are
// down. It prints only component names and hosts: no environment value (and therefore no secret)
// is ever echoed.
import net from 'node:net';

const TIMEOUT_MS = 3000;

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

async function httpOk(name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      console.error(`✖ ${name} : HTTP ${String(response.status)}`);
      return false;
    }
    console.log(`✔ ${name} : ok`);
    return true;
  } catch (error) {
    console.error(`✖ ${name} : ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function tcpOk(name, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`✖ ${name} : URL invalide`);
    return Promise.resolve(false);
  }
  const port = Number(parsed.port === '' ? '5432' : parsed.port);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: parsed.hostname, port });
    const done = (ok, detail) => {
      socket.destroy();
      if (ok) console.log(`✔ ${name} : ok (${parsed.hostname}:${String(port)})`);
      else console.error(`✖ ${name} : ${detail} (${parsed.hostname}:${String(port)})`);
      resolve(ok);
    };
    socket.setTimeout(TIMEOUT_MS);
    socket.once('connect', () => {
      done(true, 'ok');
    });
    socket.once('timeout', () => {
      done(false, 'délai dépassé');
    });
    socket.once('error', (error) => {
      done(false, error.code ?? 'injoignable');
    });
  });
}

async function webIsHonest() {
  try {
    const response = await fetch(env('WEB_HEALTH_URL', 'http://127.0.0.1:3000/api/v1/health'), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.json();
    if (!response.ok) {
      console.error(`✖ web : HTTP ${String(response.status)}`);
      return false;
    }
    if (body.database === 'unavailable') {
      console.error('✖ web : base indisponible (database=unavailable)');
      return false;
    }
    console.log(`✔ web : ok (database=${String(body.database ?? 'inconnu')})`);
    return true;
  } catch (error) {
    console.error(`✖ web : ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

const checks = await Promise.all([
  webIsHonest(),
  tcpOk('postgres', env('DATABASE_URL', 'postgresql://postgres@db:5432/postgres')),
  httpOk('supabase-rest', env('REST_URL', 'http://rest:3000/')),
  httpOk('supabase-auth', env('AUTH_URL', 'http://auth:9999/health')),
  httpOk('supabase-storage', env('STORAGE_URL', 'http://storage:5000/status')),
  httpOk('inngest', env('INNGEST_URL', 'http://inngest:8288/health')),
]);

process.exit(checks.every(Boolean) ? 0 : 1);
