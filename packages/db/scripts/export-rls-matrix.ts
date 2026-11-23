// SPEC-2101 — exports the RLS inventory to `api/oracles/vectors/rls-matrix.json`.
//
// `packages/db/src/rls/matrix.ts` stays the single source of truth (ADR-0022, ADR-0035): the Python
// integration suite replays this export through `user_tx` / `service_tx`, so the two runtimes share
// one inventory instead of maintaining two. `--check` regenerates in memory and exits 1 on drift.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RLS_MATRIX, categoryCounts, matrixPolicyNames } from '../src/rls/matrix';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const TARGET = resolve(root, 'api/oracles/vectors/rls-matrix.json');

function build(): string {
  const document = {
    source: 'packages/db/src/rls/matrix.ts',
    tables: RLS_MATRIX.map((entry) => ({
      table: entry.table,
      category: entry.category,
      scenario: entry.scenario,
      probeColumn: entry.probeColumn,
      policies: [...entry.policies],
      owner: entry.owner,
      member: entry.member,
      nonMember: entry.nonMember,
      ...(entry.justification === undefined ? {} : { justification: entry.justification }),
    })),
    categoryCounts: Object.fromEntries(
      categoryCounts().map((count) => [count.category, count.count]),
    ),
    policyNames: matrixPolicyNames(),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function main(): void {
  const content = build();
  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(TARGET, 'utf8');
    } catch {
      current = '';
    }
    if (current !== content) {
      console.error(`${TARGET} is stale: run pnpm rls:export`);
      process.exit(1);
    }
    console.log('RLS inventory is up to date');
    return;
  }
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, content);
  console.log(`${TARGET} written`);
}

main();
