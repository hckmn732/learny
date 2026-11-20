import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROOT, main, measureWebBoundary } from '../../report.mjs';

const fixtureRoot = path.join(ROOT, '.sdd', `report-test-${String(process.pid)}`);

afterEach(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function writeFixture(file: string, content: string): string {
  const target = path.join(fixtureRoot, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

describe('[SPEC-1302] permanent coupling check', () => {
  it('counts a server import introduced in apps/web and makes --check fail (CA-2)', () => {
    writeFixture('apps/web/lib/coupled.ts', "import { serviceDb } from '@learny/db';\n");
    writeFixture('packages/contracts/src/routes.ts', 'export const ROUTES = {} as const;\n');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    main(['--check'], fixtureRoot);

    expect(measureWebBoundary(fixtureRoot).coupled).toEqual([
      { file: 'apps/web/lib/coupled.ts', category: 'lib' },
    ]);
    expect(process.exitCode).toBe(1);
  });

  it('passes with a pure web client', () => {
    fs.mkdirSync(path.join(fixtureRoot, 'apps', 'web', 'lib'), { recursive: true });
    writeFixture('apps/web/lib/client.ts', "import { api } from '@learny/api-client';\n");
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    main(['--check'], fixtureRoot);

    expect(process.exitCode).toBeUndefined();
  });

  it('retains only the permanent report as a root-level script', () => {
    const scripts = fs
      .readdirSync(path.join(ROOT, 'tools', 'migration'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:mjs|mts)$/.test(entry.name))
      .map((entry) => entry.name);
    expect(scripts).toEqual(['report.mjs']);
  });

  it('contains no reference to the removed worker application outside historical material', () => {
    const forbidden = ['apps', 'worker'].join('/');
    const excluded = new Set(['.git', 'node_modules', '.next']);
    const historical = new Set(['docs/legacy', 'docs/adr', 'evidence', 'design/references']);
    const matches: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        const relative = path.relative(ROOT, file).replaceAll('\\', '/');
        if (excluded.has(entry.name)) continue;
        if (
          [...historical].some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`))
        ) {
          continue;
        }
        if (entry.isDirectory()) visit(file);
        else if (/\.(?:ts|tsx|js|mjs|md|json|yml|yaml|sh)$/.test(entry.name)) {
          if (fs.readFileSync(file, 'utf8').includes(forbidden)) matches.push(relative);
        }
      }
    };
    visit(ROOT);
    expect(matches).toEqual([]);
  });
});
