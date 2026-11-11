import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { DEMO_LOCAL_ENV, DEMO_SECRET_KEYS } from '../../lib/sdd-config-demo';
import { sddPagesEnabled } from '../../lib/sdd-pages';
import {
  configurationErrorNames,
  getPublicEnv,
  getServerEnv,
  secretPresence,
} from '../../lib/server-env';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const FIXTURE = path.join(ROOT, 'apps', 'web', 'test', 'integration', 'fixtures', 'web-startup.ts');

/** A clean process environment: the test runner variables never leak into a startup check. */
function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_OPTIONS: process.env.NODE_OPTIONS,
    SHELL: process.env.SHELL,
  };
}

/** Runs the web startup adapter in its own process, as instrumentation.ts does at boot. */
function startWeb(env: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', FIXTURE], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 45000,
    env: { ...baseEnv(), ...env },
  });
}

function clientBoundaryLint(): ESLint {
  return new ESLint({
    cwd: ROOT,
    overrideConfig: [{ files: ['**/*.tsx'], ...tseslint.configs.disableTypeChecked }],
  });
}

describe('[SPEC-009] startup web', () => {
  it('accepts the example SDD flag through the runtime guard (CA-3, CL-6)', () => {
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: 'true' })).toBe(true);
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: '1' })).toBe(false);
    expect(sddPagesEnabled({ ENABLE_SDD_PAGES: 'true', APP_ENV: 'production' })).toBe(false);
  });

  it('starts the web with a local environment and reports the mode (CA-1)', () => {
    const result = startWeb({ APP_ENV: 'local' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('web:local');
    expect(getServerEnv({ APP_ENV: 'local' }).LLM_MODE).toBe('mock');
    expect(getPublicEnv({})).toEqual({});
  }, 60000);

  it('refuses to start the web on a truncated production environment (CA-2)', () => {
    const result = startWeb({
      APP_ENV: 'production',
      DATABASE_URL: 'postgresql://learny:learny-test-only-LEAK@db.example:5432/learny',
      ANTHROPIC_API_KEY: 'sk-ant-learny-test-only-LEAK', // learny-test-only
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain('Configuration production invalide');
    expect(output).toContain('APP_ENCRYPTION_KEY');
    expect(output).not.toContain('LEAK');
    expect(output).not.toContain('learny-test-only');
    expect(configurationErrorNames({ APP_ENV: 'production', ENABLE_SDD_PAGES: 'true' })).toContain(
      'ENABLE_SDD_PAGES',
    );
  }, 60000);

  it('reports secret presence without ever returning a value (EF-7)', () => {
    const presence = secretPresence(DEMO_LOCAL_ENV, DEMO_SECRET_KEYS);

    expect(Object.values(presence)).toEqual([true, true, true, true, true, true]);
    expect(JSON.stringify(presence)).not.toContain('learny-test-only');
  });

  it('refuses a client import of the server entry through the lint boundary (ET-6)', async () => {
    const [result] = await clientBoundaryLint().lintText(
      [
        "'use client';",
        '',
        "import { parseServerEnv } from '@learny/config/server';",
        '',
        'export const probe = parseServerEnv;',
        '',
      ].join('\n'),
      { filePath: path.join(ROOT, 'apps', 'web', 'components', 'boundary-probe.tsx') },
    );
    const [adapter] = await clientBoundaryLint().lintText(
      [
        "import { parseServerEnv } from '@learny/config/server';",
        '',
        'export const probe = parseServerEnv;',
        '',
      ].join('\n'),
      { filePath: path.join(ROOT, 'apps', 'web', 'lib', 'server-env.ts') },
    );

    expect(result?.messages.map((message) => message.ruleId)).toContain('no-restricted-imports');
    expect(adapter?.messages).toEqual([]);
  }, 60000);
});
