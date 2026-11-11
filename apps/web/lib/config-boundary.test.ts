// Boundary between the public and the server configuration of apps/web (SPEC-009, ET-6, CA-2).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as publicConfig from '@learny/config';

const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ADAPTER = 'lib/server-env.ts';
const SERVER_ENTRY = '@learny/config/server';
const SKIPPED = new Set(['node_modules', '.next', 'test-results', '__screenshots__']);

// Server-only symbols that must never be reachable through the package root (EF-2).
const SERVER_ONLY_EXPORTS = [
  'parseServerEnv',
  'serverEnvSchema',
  'SERVER_ENV_KEYS',
  'RUNTIME_ENV_KEYS',
  'PRODUCTION_REQUIRED_KEYS',
  'envDefaults',
] as const;

function sources(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sources(full));
    // Tests may quote an import in a lint probe: they never run in the browser bundle.
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

function relative(file: string): string {
  return path.relative(WEB_ROOT, file).replaceAll('\\', '/');
}

const files = sources(WEB_ROOT);
const contents = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));

describe('[SPEC-009] config boundary', () => {
  it('finds real client components to scan (control of the test)', () => {
    const clientFiles = [...contents].filter(([, source]) =>
      /^\s*['"]use client['"];?/m.test(source.slice(0, 400)),
    );
    expect(clientFiles.length).toBeGreaterThan(0);
  });

  it('never imports the server entry from a client component (EF-2, CA-2)', () => {
    const offenders = [...contents]
      .filter(([, source]) => /^\s*['"]use client['"];?/m.test(source.slice(0, 400)))
      .filter(([, source]) => source.includes(SERVER_ENTRY))
      .map(([file]) => relative(file));
    expect(offenders).toEqual([]);
  });

  it('keeps a single server adapter in apps/web (ET-6)', () => {
    const importers = [...contents]
      .filter(([, source]) => source.includes(`from '${SERVER_ENTRY}'`))
      .map(([file]) => relative(file));
    expect(importers).toEqual([ADAPTER]);
  });

  it('exposes no server symbol through the package root (EF-2)', () => {
    const exported = Object.keys(publicConfig);
    for (const name of SERVER_ONLY_EXPORTS) expect(exported, name).not.toContain(name);
    // A public field is available from the root: the split keeps the useful API reachable.
    expect(exported).toContain('parsePublicEnv');
  });
});
