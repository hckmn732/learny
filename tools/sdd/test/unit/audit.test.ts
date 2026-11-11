import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { auditRepository } from '../../audit.mjs';
import { createFixture, DEFAULT_SPECS, removeFixture, specBody } from '../fixture';

let root: string | null = null;

afterEach(() => {
  if (root) removeFixture(root);
  root = null;
});

function fixture(specs = DEFAULT_SPECS): string {
  root = createFixture(specs);
  return root;
}

describe('[SPEC-003] audit', () => {
  it('accepts a consistent repository', () => {
    const r = auditRepository(fixture());
    expect(r.errors).toEqual([]);
  });

  it('detects a dependency cycle and prints the chain (CL-2)', () => {
    const dir = fixture([
      { id: 'SPEC-001', dependsOn: ['SPEC-002'] },
      { id: 'SPEC-002', dependsOn: ['SPEC-001'] },
      { id: 'SPEC-003', dependsOn: [] },
    ]);
    const r = auditRepository(dir);
    expect(r.errors.some((e) => /Cycle de dépendances : SPEC-00\d → SPEC-00\d → SPEC-00\d/.test(e))).toBe(true);
  });

  it('detects a missing specification file', () => {
    const dir = fixture();
    fs.rmSync(path.join(dir, 'specs/p0/SPEC-002-titre.md'));
    expect(auditRepository(dir).errors).toContain('SPEC-002 : fichier absent specs/p0/SPEC-002-titre.md');
  });

  it('detects a missing section', () => {
    const dir = fixture();
    fs.writeFileSync(
      path.join(dir, 'specs/p0/SPEC-003-titre.md'),
      specBody('SPEC-003', ['SPEC-001'], ['## 13. Preuves attendues']),
    );
    expect(auditRepository(dir).errors).toContain(
      'SPEC-003 : section manquante « ## 13. Preuves attendues »',
    );
  });

  it('writes no report by itself (CA-3)', () => {
    const dir = fixture();
    auditRepository(dir);
    expect(fs.existsSync(path.join(dir, 'progress', 'audit.md'))).toBe(false);
  });
});
