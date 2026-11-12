// Unit tests of the RLS inventory (SPEC-113 §12) — CA-1 and CA-4.
//
// The matrix must cover every table created by the previous migrations, every declared policy must
// be known to the matrix, and no migration may introduce a permissive `USING (true)` without an
// explicit justification comment. The integration suite then confronts this inventory with the
// real `pg_catalog`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  RLS_MATRIX,
  categoryCounts,
  findUnjustifiedPermissivePolicies,
  matrixPolicyNames,
  type RlsTableMatrix,
} from './matrix';

const MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url));

function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function migrationSql(): string {
  return migrationFiles()
    .map((file) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'))
    .join('\n');
}

/** Tables of the generated Drizzle migrations (`create table "public"."x"`). */
function declaredTables(): string[] {
  const sql = migrationSql();
  const tables = new Set<string>();
  for (const match of sql.matchAll(/create table (?:"public"\.)?"([a-z0-9_]+)"/gi)) {
    const table = match[1];
    if (table !== undefined) tables.add(table);
  }
  return [...tables].sort();
}

/** Policy names still alive after applying `create policy` / `drop policy if exists` in order. */
function livePolicies(): string[] {
  const policies = new Set<string>();
  for (const file of migrationFiles()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), 'utf8');
    // The public-schema matrix only names policies on public tables; Storage policies live on
    // `storage.objects` and are verified by the SPEC-114 storage integration suite.
    const isPublicTarget = (target: string | undefined): boolean =>
      target !== undefined && (target === 'objects' || target.startsWith('public.'));
    for (const match of sql.matchAll(/create policy\s+([a-z0-9_]+)\s+on\s+([^\s]+)/gi)) {
      const [, name, target] = match;
      if (name !== undefined && isPublicTarget(target)) policies.add(name);
    }
    for (const match of sql.matchAll(/drop policy if exists\s+([a-z0-9_]+)\s+on\s+([^\s]+)/gi)) {
      const [, name, target] = match;
      if (name !== undefined && isPublicTarget(target)) policies.delete(name);
    }
  }
  return [...policies].sort();
}

function byTable(): Map<string, RlsTableMatrix> {
  return new Map(RLS_MATRIX.map((entry) => [entry.table, entry]));
}

describe('[SPEC-113] RLS inventory', () => {
  it('CA-1 — every table created by SPEC-102–112 has exactly one scenario', () => {
    const tables = declaredTables();
    expect(tables.length).toBe(54);
    expect(RLS_MATRIX).toHaveLength(tables.length);
    expect([...byTable().keys()].sort()).toEqual(tables);

    for (const entry of RLS_MATRIX) {
      expect(entry.policies.length > 0 || entry.justification !== undefined, entry.table).toBe(
        true,
      );
      if (entry.category === 'service') {
        expect(entry.policies, entry.table).toEqual([]);
        expect(entry.justification ?? '', entry.table).not.toBe('');
      } else {
        expect(entry.justification, entry.table).toBeUndefined();
        expect(entry.policies.length, entry.table).toBeGreaterThan(0);
      }
    }
  });

  it('CA-1 — categories and role expectations are exhaustive and coherent', () => {
    expect(categoryCounts()).toEqual([
      { category: 'shared-programme', count: 7 },
      { category: 'personal', count: 42 },
      { category: 'service', count: 5 },
    ]);

    for (const entry of RLS_MATRIX) {
      if (entry.category === 'personal') {
        expect(entry.scenario, entry.table).toBe('personal-row');
        expect(entry.owner.select, entry.table).toBe(true);
        expect(entry.member, entry.table).toEqual({
          select: false,
          insert: false,
          update: false,
          delete: false,
        });
      }
      if (entry.category === 'shared-programme') {
        expect(entry.scenario, entry.table).toBe('shared-programme');
        expect(entry.owner.select, entry.table).toBe(true);
        expect(entry.member.select, entry.table).toBe(true);
        expect(entry.member.insert, entry.table).toBe(false);
        expect(entry.member.update, entry.table).toBe(false);
        expect(entry.member.delete, entry.table).toBe(false);
        expect(entry.nonMember.select, entry.table).toBe(false);
      }
      if (entry.category === 'service') {
        expect(entry.scenario, entry.table).toBe('service-table');
        expect(entry.owner, entry.table).toEqual({
          select: false,
          insert: false,
          update: false,
          delete: false,
        });
      }
      expect(
        entry.nonMember.select ||
          entry.nonMember.insert ||
          entry.nonMember.update ||
          entry.nonMember.delete,
        entry.table,
      ).toBe(false);
    }
  });

  it('CA-1, CA-4 — the matrix names exactly the policies still declared by the migrations', () => {
    expect(matrixPolicyNames()).toEqual(livePolicies());
    expect(new Set(matrixPolicyNames()).size).toBe(matrixPolicyNames().length);
  });

  it('CA-4 — no migration declares an unjustified permissive policy', () => {
    expect(findUnjustifiedPermissivePolicies(migrationSql())).toEqual([]);

    expect(
      findUnjustifiedPermissivePolicies(`
        create policy unsafe on public.resources
          for select to authenticated
          using (true);
      `),
    ).toEqual([{ line: 4, statement: 'using (true);' }]);

    expect(
      findUnjustifiedPermissivePolicies(`
        -- justification: catalogue public en lecture seule, aucune donnée personnelle.
        create policy catalogue on public.formations
          for select to authenticated
          using (true);
      `),
    ).toEqual([]);

    expect(
      findUnjustifiedPermissivePolicies(`
        create policy unsafe on public.resources
          for insert to authenticated
          with check ( true );
      `),
    ).toEqual([{ line: 4, statement: 'with check ( true );' }]);
  });
});
