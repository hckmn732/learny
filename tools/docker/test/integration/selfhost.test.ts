import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import {
  COMPOSE_FILE,
  ROOT,
  composeCommand,
  composeConfig,
  composeDown,
  composeUp,
  probeStack,
  projectVolumes,
  readFile,
  redact,
  serviceImageInfo,
  stackReady,
  waitForStack,
} from '../../check-selfhost.mjs';
import { generateSecrets, toolNow } from '../../selfhost-secrets.mjs';

const PROJECT = `learny-selfhost-it-${String(process.pid)}`;
const TAG = `learny-selfhost-it-${String(process.pid)}`;
const WEB_IMAGE = `${TAG}-web:test`;
const WORKER_IMAGE = `${TAG}-worker:test`;
const ENV_FILE = path.join(ROOT, '.sdd', 'tmp', `${PROJECT}.env`);
const EVIDENCE = path.join(ROOT, 'evidence', 'SPEC-012');
const GIT_COMMIT = 'dc30f2d';
const APP_VERSION = '0.0.0-spec-012';
// Explicit placeholders: production validation needs values, no provider is contacted.
const placeholder = (name: string): string => `selfhost-test-${name}`;

const BUILD_ARGS = {
  GIT_COMMIT,
  APP_VERSION,
  NEXT_PUBLIC_APP_URL: 'http://localhost:18180',
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:18100',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key-for-build-only',
};

let envFile = '';
let env: Record<string, string> = {};
let webPort = 18180;

function docker(args: string[], options: Record<string, unknown> = {}) {
  return spawnSync('docker', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...env },
    ...options,
  });
}

function composeArgs(args: string[]) {
  return composeCommand(PROJECT, envFile, args);
}

function psql(sql: string) {
  const result = docker(
    composeArgs(['exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', sql]),
  );
  if (result.status !== 0) throw new Error(`psql a échoué : ${result.stderr}`);
  return result.stdout.trim();
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('port libre introuvable'));
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

function writeEvidence(name: string, content: string) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), content.endsWith('\n') ? content : `${content}\n`);
}

beforeAll(async () => {
  const dockerInfo = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (dockerInfo.status !== 0) {
    throw new Error(
      'Docker Engine est indispensable au test réel de la pile auto-hébergée (CL-7) : aucun démarrage inventé.',
    );
  }
  webPort = await freePort();
  const apiPort = await freePort();
  const inngestPort = await freePort();
  fs.mkdirSync(EVIDENCE, { recursive: true });
  for (const artifact of [
    'build-web.txt',
    'build-worker.txt',
    'compose-config.txt',
    'health.json',
    'volumes.txt',
    'stack.json',
  ]) {
    fs.rmSync(path.join(EVIDENCE, artifact), { force: true });
  }

  const secrets = generateSecrets(toolNow());
  const values: Record<string, string> = {
    ...secrets,
    APP_ENV: 'production',
    // SPEC-009 rejects simulated modes and plain-HTTP public URLs in production. The stack is
    // local, so these are placeholder credentials: no provider is contacted by the probes.
    LLM_MODE: 'live',
    ANTHROPIC_API_KEY: placeholder('anthropic'),
    VOYAGE_API_KEY: placeholder('voyage'),
    RESEND_API_KEY: placeholder('resend'),
    STRIPE_MODE: 'test',
    STRIPE_SECRET_KEY: placeholder('stripe-secret'),
    STRIPE_WEBHOOK_SECRET: placeholder('stripe-webhook'),
    STRIPE_PRICE_ID: placeholder('stripe-price'),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: placeholder('stripe-public'),
    PUSH_MODE: 'live',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: placeholder('vapid-public'),
    VAPID_PRIVATE_KEY: placeholder('vapid-private'),
    VAPID_SUBJECT: 'mailto:test@learny.example',
    LEGAL_ENTITY_NAME: 'Learny Test',
    LEGAL_ENTITY_ADDRESS: '1 rue du Test, Paris',
    LEGAL_CONTACT_EMAIL: 'test@learny.example',
    LEGAL_HOST_NAME: 'learny.example',
    LEARNY_PUBLIC_APP_URL: `https://localhost:${String(webPort)}`,
    LEARNY_PUBLIC_SUPABASE_URL: `https://localhost:${String(apiPort)}`,
    LEARNY_WEB_PORT: String(webPort),
    LEARNY_SUPABASE_PORT: String(apiPort),
    LEARNY_INNGEST_PORT: String(inngestPort),
    LEARNY_WEB_IMAGE: WEB_IMAGE,
    LEARNY_WORKER_IMAGE: WORKER_IMAGE,
    GIT_COMMIT,
    APP_VERSION,
    SMTP_HOST: 'mailpit',
    SMTP_PORT: '1025',
    EMAIL_MODE: 'smtp',
  };
  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  fs.writeFileSync(
    ENV_FILE,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    { mode: 0o600 },
  );
  envFile = ENV_FILE;
  // The test values win over the Vitest environment (LLM_MODE=mock, APP_ENV=test…): the
  // self-hosted stack runs with production semantics.
  env = { ...process.env, ...values } as Record<string, string>;

  // Real, observed image builds (EF-1, ET-1, CA-1).
  for (const [dockerfile, image, log] of [
    ['docker/web.Dockerfile', WEB_IMAGE, 'build-web.txt'],
    ['docker/worker.Dockerfile', WORKER_IMAGE, 'build-worker.txt'],
  ] as const) {
    const args = ['build', '-f', dockerfile, '-t', image];
    for (const [key, value] of Object.entries(BUILD_ARGS))
      args.push('--build-arg', `${key}=${value}`);
    args.push('.');
    const result = docker(args);
    writeEvidence(log, redact(`${result.stdout}${result.stderr}`, env));
    if (result.status !== 0) throw new Error(`construction de ${image} en échec`);
  }

  const config = docker([...composeArgs(['config', '--format', 'json'])]);
  if (config.status !== 0) throw new Error(`docker compose config en échec : ${config.stderr}`);
  writeEvidence('compose-config.txt', redact(config.stdout, env));

  expect(composeUp(PROJECT, envFile, env, { build: false })).toBe(true);
  const ready = await waitForStack(PROJECT, envFile, env, 300000);
  if (!ready.ok) {
    throw new Error(
      `pile non saine : ${ready.services.map((service) => `${String(service.Service)}:${String(service.State)}/${service.Health ?? ''}`).join(', ')}`,
    );
  }
}, 900_000);

afterAll(() => {
  if (envFile === '') return;
  composeDown(PROJECT, envFile, env);
  for (const volume of projectVolumes(PROJECT)) {
    spawnSync('docker', ['volume', 'rm', '-f', volume], { stdio: 'ignore' });
  }
  fs.rmSync(envFile, { force: true });
}, 300_000);

describe('[SPEC-012] selfhost stack', () => {
  test('construit deux images non root, sans fichier .env et avec le même commit', () => {
    const web = serviceImageInfo(PROJECT, envFile, env, 'web');
    const worker = serviceImageInfo(PROJECT, envFile, env, 'worker');
    expect(web?.labels['org.opencontainers.image.revision']).toBe(GIT_COMMIT);
    expect(worker?.labels['org.opencontainers.image.revision']).toBe(GIT_COMMIT);
    expect(web?.labels['org.opencontainers.image.version']).toBe(APP_VERSION);
    expect(worker?.labels['org.opencontainers.image.version']).toBe(APP_VERSION);
    expect(web?.user).not.toMatch(/^(?:0|root)(?::|$)/);
    expect(worker?.user).not.toMatch(/^(?:0|root)(?::|$)/);

    for (const image of [WEB_IMAGE, WORKER_IMAGE]) {
      const user = docker(['run', '--rm', '--entrypoint', 'sh', image, '-c', 'id -u']);
      expect(user.status, `${image} doit démarrer`).toBe(0);
      expect(user.stdout.trim()).not.toBe('0');
      const envFiles = docker([
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        image,
        '-c',
        'find / -name ".env*" 2>/dev/null',
      ]);
      expect(envFiles.stdout.trim()).toBe('');
      const config = docker(['image', 'inspect', image, '--format', '{{json .Config.Env}}']);
      expect(config.status).toBe(0);
      expect(config.stdout).not.toMatch(
        /SUPABASE_SERVICE_ROLE_KEY|APP_ENCRYPTION_KEY|POSTGRES_PASSWORD/,
      );
    }
  }, 120_000);

  test('démarre la pile déclarée et répond aux sondes réelles (sans Mailpit)', async () => {
    const ps = docker([...composeArgs(['ps', '--all', '--format', 'json'])]);
    const services = ps.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { Service: string; State: string; Health?: string });
    expect(stackReady(services)).toBe(true);
    expect(services.some((service) => service.Service === 'mailpit')).toBe(false);

    const probes = await probeStack(PROJECT, envFile, env, String(webPort));
    writeEvidence('health.json', JSON.stringify(probes, null, 2));
    for (const probe of probes) expect(probe.ok, `${probe.name} : ${probe.detail}`).toBe(true);

    const web = await fetch(`http://127.0.0.1:${String(webPort)}/api/v1/health`);
    const body = (await web.json()) as { commit: string; status: string };
    expect(web.status).toBe(200);
    expect(body.commit).toBe(GIT_COMMIT);

    const volumes = projectVolumes(PROJECT);
    writeEvidence('volumes.txt', volumes.join('\n'));
    expect(volumes).toEqual(
      expect.arrayContaining([
        `${PROJECT}_db-data`,
        `${PROJECT}_storage-data`,
        `${PROJECT}_inngest-data`,
      ]),
    );
    writeEvidence(
      'stack.json',
      JSON.stringify(
        {
          project: PROJECT,
          webImage: WEB_IMAGE,
          workerImage: WORKER_IMAGE,
          commit: GIT_COMMIT,
          services,
          probes,
          volumes,
        },
        null,
        2,
      ),
    );
  }, 120_000);

  test('un secret obligatoire absent empêche la configuration (CL-1, CA-3)', () => {
    const text = readFile(COMPOSE_FILE);
    const withoutSecret = fs
      .readFileSync(envFile, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('POSTGRES_PASSWORD='))
      .join('\n');
    const partial = path.join(ROOT, '.sdd', 'tmp', `${PROJECT}-missing.env`);
    fs.writeFileSync(partial, `${withoutSecret}\n`, { mode: 0o600 });
    const partialEnv = Object.fromEntries(
      Object.entries(env).filter(([key]) => key !== 'POSTGRES_PASSWORD'),
    );
    const resolved = composeConfig(partial, partialEnv);
    fs.rmSync(partial, { force: true });
    if (resolved.ok) throw new Error('docker compose config aurait dû échouer sans secret');
    expect(resolved.error).toContain('POSTGRES_PASSWORD');
    expect(text).toContain('${POSTGRES_PASSWORD:?POSTGRES_PASSWORD est obligatoire}');
    // The observed secret value never appears in the error (only the variable name does).
    expect(resolved.error).not.toContain(env.POSTGRES_PASSWORD ?? '<absent>');
  });

  test('un redémarrage conserve la base, le stockage et les migrations (CL-3, CA-2)', async () => {
    const marker = `probe-${String(process.pid)}`;
    psql(
      `create table if not exists public.selfhost_probe (id text primary key, created_at timestamptz not null default now()); insert into public.selfhost_probe (id) values ('${marker}') on conflict do nothing;`,
    );
    const appliedBefore = psql(
      "select applied_at from public.selfhost_schema_migrations where name = '0000_extensions.sql'",
    );
    expect(appliedBefore).not.toBe('');

    const storage = docker(
      composeArgs([
        'exec',
        '-T',
        'storage',
        'sh',
        '-c',
        'echo probe > /var/lib/storage/selfhost-probe.txt',
      ]),
    );
    expect(storage.status).toBe(0);

    expect(docker(composeArgs(['restart', 'db'])).status).toBe(0);
    expect((await waitForStack(PROJECT, envFile, env, 120000)).ok).toBe(true);
    const afterRestart = psql(`select id from public.selfhost_probe where id = '${marker}'`);
    expect(afterRestart).toBe(marker);
    expect(
      psql(
        "select applied_at from public.selfhost_schema_migrations where name = '0000_extensions.sql'",
      ),
    ).toBe(appliedBefore);

    expect(composeDown(PROJECT, envFile, env)).toBe(true);
    const volumesAfterDown = projectVolumes(PROJECT);
    expect(volumesAfterDown).toEqual(
      expect.arrayContaining([
        `${PROJECT}_db-data`,
        `${PROJECT}_storage-data`,
        `${PROJECT}_inngest-data`,
      ]),
    );

    expect(composeUp(PROJECT, envFile, env, { build: false })).toBe(true);
    const ready = await waitForStack(PROJECT, envFile, env, 120000);
    expect(ready.ok, JSON.stringify(ready.services)).toBe(true);
    expect(psql(`select id from public.selfhost_probe where id = '${marker}'`)).toBe(marker);
    expect(
      psql(
        "select applied_at from public.selfhost_schema_migrations where name = '0000_extensions.sql'",
      ),
    ).toBe(appliedBefore);
    const storageProbe = docker(
      composeArgs(['exec', '-T', 'storage', 'sh', '-c', 'cat /var/lib/storage/selfhost-probe.txt']),
    );
    expect(storageProbe.stdout.trim()).toBe('probe');
  }, 300_000);

  test('la santé du web échoue quand la base est indisponible (CL-2)', async () => {
    expect(docker(composeArgs(['stop', 'db'])).status).toBe(0);
    const unhealthy = docker(
      composeArgs(['exec', '-T', 'web', 'node', '/app/healthcheck-web.mjs']),
    );
    expect(unhealthy.status).not.toBe(0);
    const unhealthyOutput = `${unhealthy.stdout}${unhealthy.stderr}`;
    expect(unhealthyOutput).toMatch(/postgres/);
    // The probe is honest: the local API still answers, but the container health fails on the
    // unreachable database and never reports a healthy stack (no fabricated `ok`).
    expect(unhealthyOutput).toMatch(/✖ supabase-rest : HTTP 503|✖ postgres/);

    expect(docker(composeArgs(['start', 'db'])).status).toBe(0);
    const ready = await waitForStack(PROJECT, envFile, env, 120000);
    expect(ready.ok, JSON.stringify(ready.services)).toBe(true);
    const healthy = docker(composeArgs(['exec', '-T', 'web', 'node', '/app/healthcheck-web.mjs']));
    expect(healthy.status).toBe(0);
  }, 300_000);
});
