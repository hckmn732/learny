// SPEC-807 §12 — integration of the journey fixtures (CA-2, CA-5): the demo seed is re-applied,
// two isolated learners are created with the SPEC-115 factories, the AI fixtures named by the
// matrix are chosen by scenario in mock mode, the injectable clock is checked, then the
// documentary validator runs against the real repository.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  clock,
  createClockFromEnv,
  setClock,
  type Clock,
} from '../../../../packages/core/src/clock';
import { closeDb, serviceDb, sql } from '../../../../packages/db/src/index';
import { demoUserId } from '../../../../packages/db/src/seed/demo-fixtures';
import { asUser, createTestProgramme, withRollback } from '../../../../packages/db/src/testing';
import { FIXTURE_REGISTRY } from '../../../../packages/llm/src/mock/fixture-registry';
import { selectFixture } from '../../../../packages/llm/src/mock/select';
import { createFixedClock, FIXED_TIME_ISO } from '../../../../packages/testing/src/clock';
import { assertMockLlm } from '../../../../packages/testing/src/env';
import { createResource, createUser } from '../../../../packages/testing/src/factories';
import { REPO, checkJourneys } from '../../check-v1-journeys.mjs';

const MATRIX = fs.readFileSync(path.join(REPO, 'docs', 'quality', 'v1-journeys.md'), 'utf8');
const LLM_PREFIX = 'packages/llm/fixtures/';

beforeAll(() => {
  // Réinitialise le jeu SPEC-115 (idempotent) avant de vérifier qu'il reste intact.
  const seed = spawnSync('pnpm', ['-s', 'db:seed:demo'], { cwd: REPO, encoding: 'utf8' });
  expect(seed.status, seed.stderr).toBe(0);
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-807] journey fixtures', () => {
  it('réinitialise le jeu de démonstration sans le dupliquer', async () => {
    const before = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.formations where owner_id = ${demoUserId('alex')}::uuid
    `);
    const again = spawnSync('pnpm', ['-s', 'db:seed:demo'], { cwd: REPO, encoding: 'utf8' });
    expect(again.status, again.stderr).toBe(0);
    const after = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.formations where owner_id = ${demoUserId('alex')}::uuid
    `);
    expect(before[0]?.count).toBeGreaterThan(0);
    expect(after[0]?.count).toBe(before[0]?.count);
  });

  it('isole les données de deux apprenants créés par les fabriques (CL-2)', async () => {
    await withRollback(async (tx) => {
      const first = await createUser(tx, { firstName: 'Parcours', lastName: 'Un' });
      const second = await createUser(tx, { firstName: 'Parcours', lastName: 'Deux' });
      expect(first.id).not.toBe(second.id);
      expect(first.email).not.toBe(second.email);

      const own = await createTestProgramme(tx, first.id, { modules: 2, title: 'Parcours 807 A' });
      const other = await createTestProgramme(tx, second.id, {
        modules: 1,
        title: 'Parcours 807 B',
      });
      const note = await createResource(tx, {
        ownerId: first.id,
        formationId: own.formationId,
        chapterId: own.chapterIds[0] ?? null,
        kind: 'note',
        title: 'Note privée du parcours',
        content: 'Passage propre au premier apprenant.',
      });

      const seenByOwner = await asUser(tx, first.id, (inner) =>
        inner.execute<{ id: string }>(sql`select id::text as id from public.resources`),
      );
      expect(seenByOwner.map((row) => row.id)).toEqual([note.id]);

      const resourcesOfOther = await asUser(tx, second.id, (inner) =>
        inner.execute<{ id: string }>(sql`select id::text as id from public.resources`),
      );
      expect(resourcesOfOther).toEqual([]);

      const formationsOfOther = await asUser(tx, second.id, (inner) =>
        inner.execute<{ id: string }>(sql`select id::text as id from public.formations`),
      );
      expect(formationsOfOther.map((row) => row.id)).toEqual([other.formationId]);

      const demoSeen = await asUser(tx, second.id, (inner) =>
        inner.execute<{ count: number }>(sql`
          select count(*)::int as count from public.formations
          where owner_id = ${demoUserId('alex')}::uuid
        `),
      );
      expect(demoSeen[0]?.count).toBe(0);
    });
  });

  it('choisit chaque fixture IA de la matrice par scénario, en mode simulé (CL-1)', () => {
    expect(() => {
      assertMockLlm(process.env);
    }).not.toThrow();
    const referenced = [
      ...new Set(
        [...MATRIX.matchAll(/`(packages\/llm\/fixtures\/[^`]+\.json)`/g)].map((match) =>
          (match[1] ?? '').slice(LLM_PREFIX.length),
        ),
      ),
    ];
    expect(referenced.length).toBeGreaterThanOrEqual(8);
    for (const file of referenced) {
      const entry = FIXTURE_REGISTRY.find((candidate) => candidate.path === file);
      expect(entry, `${file} absente du registre`).toBeDefined();
      if (entry === undefined) continue;
      const { fixture } = entry;
      expect(fixture.scenario, file).toBeTruthy();
      const selected = selectFixture({
        task: fixture.task,
        promptId: fixture.promptId,
        messages: [],
        explicitScenario: fixture.scenario,
      });
      expect(selected.ok, file).toBe(true);
      if (selected.ok) expect(selected.value.scenario).toBe(fixture.scenario);
    }
    // A scenario without fixture fails explicitly instead of reaching a live model.
    const missing = selectFixture({
      task: 'tutor',
      promptId: 'tutor.inconnu-807',
      messages: [],
      explicitScenario: 'scenario-absent-807',
    });
    expect(missing.ok).toBe(false);
  });

  it('fige l’horloge injectable et l’avance sans toucher à l’heure système', () => {
    expect(process.env.CLOCK_FIXED_AT).toBe(FIXED_TIME_ISO);
    const fromEnv = createClockFromEnv({ CLOCK_FIXED_AT: FIXED_TIME_ISO });
    expect(fromEnv.now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
    expect(fromEnv.now()).not.toBe(fromEnv.now());

    const previous: Clock = clock;
    const plus30 = createFixedClock('2026-12-11T12:20:00Z');
    try {
      setClock(plus30);
      expect(clock.now().toISOString()).toBe('2026-12-11T12:20:00.000Z');
    } finally {
      setClock(previous);
    }
    expect(createFixedClock().now().toISOString()).toBe('2026-11-11T12:20:00.000Z');
  });

  it('valide la matrice documentaire du dépôt (CA-5)', () => {
    const report = checkJourneys();
    expect(report.errors).toEqual([]);
    expect(report.journeys).toBe(6);
    expect(report.steps).toBeGreaterThanOrEqual(50);

    const cli = spawnSync(process.execPath, ['tools/quality/check-v1-journeys.mjs'], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toContain('6 parcours');
  });
});
