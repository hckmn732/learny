import fs from 'node:fs';

import conventional from '@commitlint/config-conventional';
import lint from '@commitlint/lint';
import { describe, expect, it } from 'vitest';

import { commitlintPlugin, commitlintRules } from './commit-rules';

const RULES = { ...conventional.rules, ...commitlintRules };

async function check(message: string) {
  return lint(message, RULES, { plugins: { learny: commitlintPlugin }, defaultIgnores: true });
}

const catalog = JSON.parse(
  fs.readFileSync(new URL('../../../specs/catalog.json', import.meta.url), 'utf8'),
) as { specs: { id: string; title: string }[] };

describe('[SPEC-002] commit rules', () => {
  it.each([
    'feat(SPEC-402): calcule la prochaine révision FSRS',
    'evidence(SPEC-001): preuves de validation',
    'chore(SPEC-001): marque la spécification terminée',
    'merge(SPEC-006): Application web : configuration de base, santé et pages de démonstration',
    'chore(CP-0): checkpoint CP-0 réussi',
    'chore(sdd): initialise le référentiel',
    'docs(SPEC-002): complète CONTRIBUTING',
  ])('accepts %s', async (message) => {
    const report = await check(message);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it.each([
    ['feat: ajoute X', 'scope-empty'],
    ['feat(web): ajoute X', 'learny/scope-pattern'],
    ['feature(SPEC-001): ajoute X', 'type-enum'],
    ['feat(SPEC-1): ajoute X', 'learny/scope-pattern'],
    ['feat(SPEC-001):', 'subject-empty'],
    ['feat(SPEC-001): ajoute X.', 'subject-full-stop'],
    [`feat(SPEC-001): ${'a'.repeat(73)}`, 'learny/subject-max-length'],
    ['ajoute X', 'type-empty'],
  ])('rejects %s (%s)', async (message, rule) => {
    const report = await check(message);
    expect(report.valid).toBe(false);
    expect(report.errors.map((e) => e.name)).toContain(rule);
  });

  it('allows merge descriptions up to 100 characters (CL-1)', async () => {
    const subject = 'Application web : configuration de base, santé et pages de démonstration';
    expect((await check(`merge(SPEC-006): ${subject}`)).valid).toBe(true);
    expect((await check(`merge(SPEC-006): ${'a'.repeat(80)}`)).valid).toBe(true);
    expect((await check(`feat(SPEC-006): ${'a'.repeat(80)}`)).valid).toBe(false);
    const tooLong = await check(`merge(SPEC-006): ${'a'.repeat(101)}`);
    expect(tooLong.errors.map((e) => e.name)).toContain('learny/subject-max-length');
  });

  it('accepts a body and a Refs footer, rejects a body glued to the header (CL-2)', async () => {
    const ok = 'feat(SPEC-402): calcule la révision\n\nCorps explicatif.\n\nRefs: SPEC-402';
    expect((await check(ok)).valid).toBe(true);
    const glued = await check('feat(SPEC-402): calcule la révision\nCorps collé.');
    expect(glued.errors.map((e) => e.name)).toContain('body-leading-blank');
  });

  it('ignores Git revert messages (CL-3)', async () => {
    expect((await check('Revert "feat(SPEC-402): calcule la révision"')).valid).toBe(true);
  });

  it('reports the plugin messages', async () => {
    const scope = await check('feat(web): ajoute X');
    expect(scope.errors.find((e) => e.name === 'learny/scope-pattern')?.message).toBe(
      'la portée doit être SPEC-xxx, CP-n ou sdd',
    );
    const long = await check(`feat(SPEC-001): ${'a'.repeat(73)}`);
    expect(long.errors.find((e) => e.name === 'learny/subject-max-length')?.message).toBe(
      'la description dépasse 72 caractères (100 pour merge)',
    );
  });

  it('accepts the commits written by complete.mjs and checkpoint.mjs (CA-6)', async () => {
    expect((await check('evidence(SPEC-001): preuves de validation')).valid).toBe(true);
    expect((await check('chore(SPEC-001): marque la spécification terminée')).valid).toBe(true);
    expect((await check('chore(CP-9): checkpoint CP-9 réussi')).valid).toBe(true);
  });

  it.each(catalog.specs.map((s) => [s.id, s.title] as const))(
    'accepts the merge commit of %s (CA-6)',
    async (id, title) => {
      const report = await check(`merge(${id}): ${title.replaceAll('"', "'")}`);
      expect(report.errors).toEqual([]);
    },
  );
});
