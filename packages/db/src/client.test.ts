import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  MigrationCheckError,
  checkMigrations,
  normalizeSql,
  planSync,
  type MigrationEntry,
} from '../scripts/migrations-lib.mjs';

import { buildUserClaims, userDb } from './client';

const VALID_USER = '11111111-1111-4111-8111-111111111111';

function entry(name: string, content: string): MigrationEntry {
  return { name, content };
}

function tempDirs(): { source: string; target: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-migrations-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
  return {
    source,
    target,
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

describe('[SPEC-101] clients db', () => {
  it('builds the Supabase claims with sub, role and aud (ET-5)', () => {
    const claims = JSON.parse(
      buildUserClaims({ userId: VALID_USER, email: 'alex@example.test' }),
    ) as Record<string, unknown>;
    expect(claims).toEqual({
      sub: VALID_USER,
      role: 'authenticated',
      aud: 'authenticated',
      email: 'alex@example.test',
    });
    expect(JSON.parse(buildUserClaims({ userId: VALID_USER }))).toEqual({
      sub: VALID_USER,
      role: 'authenticated',
      aud: 'authenticated',
    });
  });

  it('rejects a non-UUID user before acquiring any connection (CL-1)', () => {
    let thrown: unknown;
    try {
      userDb({ userId: 'not-a-uuid' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).code).toBe('FORBIDDEN');
  });

  it('plans a write for a new source migration (CA-4)', () => {
    const plan = planSync([entry('0001_shared_enums.sql', 'select 1;\n')], []);
    expect(plan.writes).toEqual([
      {
        name: '20261111000001_shared_enums.sql',
        content: 'select 1;\n',
        reason: 'missing',
      },
    ]);
    expect(plan.deletes).toEqual([]);
    expect(plan.unchanged).toEqual([]);
  });

  it('does not rewrite an identical target and normalises CRLF (CA-4)', () => {
    const target = [entry('20261111000000_extensions_and_shared.sql', 'select 1;\n')];
    const plan = planSync([entry('0000_extensions_and_shared.sql', 'select 1;\r\n')], target);
    expect(plan.writes).toEqual([]);
    expect(plan.unchanged).toEqual(['20261111000000_extensions_and_shared.sql']);
    expect(normalizeSql('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('plans a rewrite when the target content differs (CA-4)', () => {
    const plan = planSync(
      [entry('0001_shared_enums.sql', 'select 2;\n')],
      [entry('20261111000001_shared_enums.sql', 'select 1;\n')],
    );
    expect(plan.writes[0]).toMatchObject({ reason: 'changed', content: 'select 2;\n' });
  });

  it('lists orphan target migrations for deletion (CL-4)', () => {
    const plan = planSync(
      [entry('0001_shared_enums.sql', 'select 1;\n')],
      [
        entry('20261111000001_shared_enums.sql', 'select 1;\n'),
        entry('20261111000002_duplicate.sql', 'select 1;\n'),
      ],
    );
    expect(plan.deletes).toEqual(['20261111000002_duplicate.sql']);
  });

  it('checkMigrations fails on a missing, different or orphaned target (CA-4, CL-4)', () => {
    const dirs = tempDirs();
    try {
      fs.writeFileSync(
        path.join(dirs.source, '0001_shared_enums.sql'),
        "create type x as enum ('a');\n",
      );
      expect(() => checkMigrations(dirs.source, dirs.target)).toThrow(MigrationCheckError);

      fs.writeFileSync(
        path.join(dirs.target, '20261111000001_shared_enums.sql'),
        "create type x as enum ('b');\n",
      );
      expect(() => checkMigrations(dirs.source, dirs.target)).toThrow(/contenu différent/);

      fs.writeFileSync(
        path.join(dirs.target, '20261111000001_shared_enums.sql'),
        "create type x as enum ('a');\n",
      );
      fs.writeFileSync(path.join(dirs.target, '20261111000009_orphan.sql'), 'select 9;\n');
      expect(() => checkMigrations(dirs.source, dirs.target)).toThrow(/orpheline/);

      fs.rmSync(path.join(dirs.target, '20261111000009_orphan.sql'));
      expect(checkMigrations(dirs.source, dirs.target)).toEqual({ ok: true, checked: 1 });
    } finally {
      dirs.cleanup();
    }
  });
});
