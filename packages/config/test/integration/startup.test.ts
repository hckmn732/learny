import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DOCUMENTED_ENV_KEYS,
  STANDARD_ENV_KEYS,
  TOOLING_ENV_KEYS,
  parseServerEnv,
} from '../../src/env';
import { isForbiddenSecretFile, scanText } from '../../src/secret-patterns';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const EXAMPLE = path.join(ROOT, '.env.example');

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

    // The historical value `1` fails the coherence check above (the file must say `true`) and
    // disables the pages at runtime, exactly like the guard of SPEC-006 (ADR-0226).
    expect(parseServerEnv({ ...example, ENABLE_SDD_PAGES: '1' }).ENABLE_SDD_PAGES).toBe(false);
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
  // The TypeScript API server these startup tests spawned is gone (SPEC-2302): the Python
  // facade refuses an incomplete production itself (python/learny/tests, ADR-2042).
});
