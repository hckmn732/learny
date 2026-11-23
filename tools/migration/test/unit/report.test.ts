import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROOT, countRegistryRoutes, main, measureWebBoundary } from '../../report.mjs';

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

  it('retains only the permanent report and the SPEC-2001 inventory as root-level scripts', () => {
    const scripts = fs
      .readdirSync(path.join(ROOT, 'tools', 'migration'), { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:mjs|mts)$/.test(entry.name))
      .map((entry) => entry.name);
    expect(scripts.sort()).toEqual(['inventory.mjs', 'report.mjs']);
  });

  it('counts the 217 real routes and ignores the factory definitions (CA-5)', () => {
    expect(countRegistryRoutes(ROOT)).toBe(217);
  });

  it('contains no reference to the removed worker application outside historical material', () => {
    // `apps/worker-py` is the Python worker of the migration, not the retired application.
    const forbidden = /apps\/worker(?!-py)/u;
    // Local dependency caches are not source code (SPEC-2003 adds the Python venv).
    const excluded = new Set(['.git', 'node_modules', '.next', '.venv']);
    // Documentation that *describes* the removal: ADRs, the python-migration specs and the
    // technical canvas necessarily name the retired application. Only executable files must stay
    // free of it (SPEC-2001, ADR-2001).
    const historical = new Set([
      'docs/legacy',
      'docs/adr',
      'docs/architecture',
      'evidence',
      'design/references',
      'specs',
    ]);
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
        if (relative === 'tools/migration/test/unit/report.test.ts') continue; // le garde-fou
        if (entry.isDirectory()) visit(file);
        else if (/\.(?:ts|tsx|js|mjs|json|yml|yaml|sh)$/.test(entry.name)) {
          if (forbidden.test(fs.readFileSync(file, 'utf8'))) matches.push(relative);
        }
      }
    };
    visit(ROOT);
    expect(matches).toEqual([]);
  });
});
