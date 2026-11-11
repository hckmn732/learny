import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DOCUMENTED_ENV_KEYS,
  PRODUCTION_REQUIRED_KEYS,
  STANDARD_ENV_KEYS,
  TOOLING_ENV_KEYS,
  parseServerEnv,
} from '../../src/env';
import { isForbiddenSecretFile, scanText } from '../../src/secret-patterns';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const EXAMPLE = path.join(ROOT, '.env.example');
const WORKER = path.join(ROOT, 'apps', 'worker', 'src', 'server.ts');

/** Reads `.env.example` as a record; quoted values are unquoted, comments ignored (ET-5). */
function readExample(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(EXAMPLE, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match?.[1]) continue;
    let value = (match[2] ?? '').trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

/** A clean process environment: the test runner variables never leak into a startup check. */
function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: process.env.NODE_ENV ?? 'production',
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_OPTIONS: process.env.NODE_OPTIONS,
    SHELL: process.env.SHELL,
  };
}

function runNode(args: readonly string[], env: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 45000,
    env: { ...baseEnv(), ...env },
  });
}

function freePort(): Promise<number> {
  return new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/** Polls a check without reading the wall clock (150 × 200 ms ≈ 30 s). */
async function waitFor(check: () => Promise<boolean>, attempts = 150): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await check()) return true;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 200);
    });
  }
  return false;
}

describe('[SPEC-009] startup', () => {
  it('keeps .env.example and the schemas on the same documented keys (CA-3)', () => {
    const example = readExample();
    const keys = Object.keys(example);

    expect([...keys].sort()).toEqual([...DOCUMENTED_ENV_KEYS].sort());
    // CI and Node variables stay outside the application contract.
    for (const key of STANDARD_ENV_KEYS) expect(keys, key).not.toContain(key);
    // Tooling keys are documented but never validated as runtime configuration.
    for (const key of TOOLING_ENV_KEYS) expect(DOCUMENTED_ENV_KEYS).toContain(key);
  });

  it('accepts the example as a local environment and the SDD flag as true (CA-3, CL-6)', () => {
    const example = readExample();
    const env = parseServerEnv(example);

    expect(env.APP_ENV).toBe('local');
    expect(env.ENABLE_SDD_PAGES).toBe(true);
    expect(example.ENABLE_SDD_PAGES).toBe('true');
    expect(env.LLM_MODE).toBe('mock');

    // The historical value `1` is refused by the schema and by the runtime guard.
    expect(() => parseServerEnv({ ...example, ENABLE_SDD_PAGES: '1' })).toThrow(/ENABLE_SDD_PAGES/);
  });

  it('versions .env.example without any secret and ignores real env files (ET-5)', () => {
    const content = fs.readFileSync(EXAMPLE, 'utf8');

    expect(scanText(content, '.env.example')).toEqual([]);
    expect(isForbiddenSecretFile('.env.example')).toBe(false);
    for (const ignored of ['.env', '.env.local', '.env.production.local']) {
      expect(isForbiddenSecretFile(ignored), ignored).toBe(true);
    }
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toContain('.env.*');
    expect(gitignore).toContain('!.env.example');
  });

  it('starts the worker with a local environment (CA-1)', async () => {
    const port = await freePort();
    const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', WORKER], {
      cwd: ROOT,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, APP_ENV: 'local', PORT: String(port) },
    });
    try {
      const healthy = await waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${String(port)}/health`).catch(() => null);
        return response?.status === 200;
      });
      expect(healthy).toBe(true);
    } finally {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    }
  }, 60000);

  it('refuses to start the worker on a truncated production environment (CA-2)', () => {
    const result = runNode([WORKER], {
      APP_ENV: 'production',
      PORT: '3999',
      DATABASE_URL: 'postgresql://learny:learny-test-only-LEAK@db.example:5432/learny',
      ANTHROPIC_API_KEY: 'sk-ant-learny-test-only-LEAK', // learny-test-only
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('Configuration production invalide');
    // DATABASE_URL and ANTHROPIC_API_KEY are provided: only the others are named.
    const provided = new Set(['DATABASE_URL', 'ANTHROPIC_API_KEY']);
    for (const name of PRODUCTION_REQUIRED_KEYS) {
      if (provided.has(name)) expect(output).not.toContain(`${name}, `);
      else expect(output).toContain(name);
    }
    expect(output).not.toContain('LEAK');
    expect(output).not.toContain('learny-test-only');
  }, 60000);
});
