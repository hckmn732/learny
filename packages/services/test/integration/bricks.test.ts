// Integration tests of the brick service and its two routes (SPEC-501 §12, CA-5 to CA-7).
//
// Postgres is real (RLS, immutable versions, composite report foreign key, row locks). Fixtures are
// committed because the concurrency and two-learner tests need several connections; every account
// is removed at the end.
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { type Clock } from '@learny/core';
import { bricks, closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';

import {
  activeBricksFilter,
  correctBrick,
  createBrick,
  createBrickVersion,
  getPublicBrick,
  reportBrick,
  retireBrick,
} from '../../src/bricks';
import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-501-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Fixture {
  userId: string;
  email: string;
  formationId: string;
  notionIds: string[];
  ctx: ServiceContext;
}

async function fixture(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
    });
    return {
      userId: user.id,
      email,
      formationId: programme.formationId,
      notionIds: programme.notionIds,
      ctx: createServiceContext({
        userId: user.id,
        email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

function choicePayload(notionIds: readonly string[], stem = 'Quel compte augmente au débit ?') {
  return {
    stem,
    mode: 'single' as const,
    options: [
      { id: 'a', text: 'Le compte de banque', correct: true, notionId: notionIds[0] },
      { id: 'b', text: 'Le compte de capital', correct: false, notionId: notionIds[1] },
    ],
    explanation: 'L’encaissement augmente le compte de banque au débit.',
    objective: 'Distinguer un compte d’actif d’un compte de passif',
    sources: [],
  };
}

async function newBrick(fx: Fixture, stem?: string) {
  const created = await createBrick(fx.ctx, {
    type: 'choice_question',
    formationId: fx.formationId,
    purpose: 'bank',
    notionIds: [fx.notionIds[0] as string],
    origin: 'tutor',
    payload: choicePayload(fx.notionIds, stem),
    createdBy: 'tutor',
  });
  expect(created.ok).toBe(true);
  if (!created.ok) throw created.error;
  return created.value;
}

async function statusOf(brickId: string): Promise<string> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.bricks where id = ${brickId}::uuid`,
  );
  return rows[0]?.status ?? 'missing';
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-501] service des briques', () => {
  it('crée une brique et sa version 1 dans une transaction (EF-1)', async () => {
    const fx = await fixture('create');
    const created = await newBrick(fx);
    expect(created.version).toBe(1);
    expect(created.fingerprint).toMatch(/^[0-9a-f]{64}$/);

    const versions = await serviceDb().execute<{ version: number; created_by: string }>(sql`
      select version, created_by::text as created_by
      from public.brick_versions where brick_id = ${created.brickId}::uuid
    `);
    expect(versions).toEqual([{ version: 1, created_by: 'tutor' }]);
    expect(await statusOf(created.brickId)).toBe('active');
  });

  it('crée la version suivante et laisse les réponses liées à la version 1 (EF-2, CA-5)', async () => {
    const fx = await fixture('versions');
    const created = await newBrick(fx);
    const next = await createBrickVersion(fx.ctx, created.brickId, {
      payload: choicePayload(fx.notionIds, 'Énoncé corrigé ?'),
      expectedVersion: 1,
      createdBy: 'tutor',
    });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value.version).toBe(2);

    const v1 = await getPublicBrick(fx.ctx, created.versionId);
    expect(v1.ok).toBe(true);
    if (v1.ok) expect(JSON.stringify(v1.value.publicPayload)).toContain('Quel compte augmente');

    const stale = await createBrickVersion(fx.ctx, created.brickId, {
      payload: choicePayload(fx.notionIds),
      expectedVersion: 1,
      createdBy: 'tutor',
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('CONFLICT');
  });

  it('signale, exclut des tirages puis corrige côté apprenant (EF-3, EF-4, CA-5)', async () => {
    const fx = await fixture('report');
    const created = await newBrick(fx);

    const report = await reportBrick(fx.ctx, created.brickId, {
      reason: 'La formulation est ambiguë.',
    });
    expect(report.ok).toBe(true);
    if (!report.ok) throw report.error;
    expect(report.value.created).toBe(true);
    expect(await statusOf(created.brickId)).toBe('reported');

    const active = await serviceDb()
      .select({ id: bricks.id })
      .from(bricks)
      .where(activeBricksFilter);
    expect(active.some((row) => row.id === created.brickId)).toBe(false);

    const duplicate = await reportBrick(fx.ctx, created.brickId, { reason: 'Encore.' });
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok)
      expect(duplicate.value).toMatchObject({
        reportId: report.value.reportId,
        created: false,
      });

    const corrected = await correctBrick(fx.ctx, created.brickId, {
      payload: choicePayload(fx.notionIds, 'Énoncé corrigé par l’apprenant ?'),
      expectedVersion: 1,
    });
    expect(corrected.ok).toBe(true);
    expect(await statusOf(created.brickId)).toBe('active');

    const reports = await serviceDb().execute<{
      status: string;
      resolution: { by: string; versionId: string };
      resolved_at: string | null;
    }>(sql`
      select status::text as status, resolution, resolved_at::text as resolved_at
      from public.brick_reports where id = ${report.value.reportId}::uuid
    `);
    expect(reports[0]?.status).toBe('corrected');
    expect(reports[0]?.resolution.by).toBe('learner');
    expect(reports[0]?.resolved_at).not.toBeNull();
    expect(reports[0]?.resolution.versionId).toBe(corrected.ok ? corrected.value.versionId : '');
  });

  it('refuse une correction invalide sans changer statut ni signalement (CL-8)', async () => {
    const fx = await fixture('invalid');
    const created = await newBrick(fx);
    await reportBrick(fx.ctx, created.brickId, { reason: 'À corriger.' });
    const invalid = choicePayload(fx.notionIds);
    invalid.options = [invalid.options[0] as (typeof invalid.options)[number]];
    const corrected = await correctBrick(fx.ctx, created.brickId, {
      payload: invalid,
      expectedVersion: 1,
    });
    expect(corrected.ok).toBe(false);
    if (!corrected.ok) expect(corrected.error.code).toBe('BRICK_INVALID');
    expect(await statusOf(created.brickId)).toBe('reported');
  });

  it('isole deux utilisateurs (CA-6)', async () => {
    const alice = await fixture('alice');
    const bob = await fixture('bob');
    const created = await newBrick(alice);

    const foreignVersion = await getPublicBrick(bob.ctx, created.versionId);
    expect(foreignVersion.ok).toBe(false);
    if (!foreignVersion.ok) expect(foreignVersion.error.code).toBe('NOT_FOUND');

    const foreignCorrection = await correctBrick(bob.ctx, created.brickId, {
      payload: choicePayload(bob.notionIds),
      expectedVersion: 1,
    });
    expect(foreignCorrection.ok).toBe(false);
    if (!foreignCorrection.ok) expect(foreignCorrection.error.code).toBe('NOT_FOUND');

    const foreignNotion = await createBrick(alice.ctx, {
      type: 'choice_question',
      formationId: alice.formationId,
      purpose: 'bank',
      notionIds: [bob.notionIds[0] as string],
      origin: 'tutor',
      payload: choicePayload(alice.notionIds),
      createdBy: 'tutor',
    });
    expect(foreignNotion.ok).toBe(false);
    if (!foreignNotion.ok) {
      expect(foreignNotion.error.code).toBe('BRICK_INVALID');
      expect(foreignNotion.error.errors?.map((issue) => issue.code)).toContain('NOTION_NOT_FOUND');
    }
  });

  it('refuse de signaler une brique retirée (CL-9)', async () => {
    const fx = await fixture('retired');
    const created = await newBrick(fx);
    const retired = await retireBrick(fx.ctx, created.brickId);
    expect(retired.ok).toBe(true);
    const report = await reportBrick(fx.ctx, created.brickId, { reason: 'Trop tard.' });
    expect(report.ok).toBe(false);
    if (!report.ok) expect(report.error.code).toBe('BRICK_RETIRED');
  });

  it('n’accepte qu’une des deux corrections concurrentes (CA-7)', async () => {
    const fx = await fixture('concurrent');
    const created = await newBrick(fx);
    const results = await Promise.all([
      createBrickVersion(fx.ctx, created.brickId, {
        payload: choicePayload(fx.notionIds, 'Première correction ?'),
        expectedVersion: 1,
        createdBy: 'learner',
      }),
      createBrickVersion(fx.ctx, created.brickId, {
        payload: choicePayload(fx.notionIds, 'Seconde correction ?'),
        expectedVersion: 1,
        createdBy: 'learner',
      }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const failed = results.find((result) => !result.ok);
    expect(failed?.ok === false ? failed.error.code : null).toBe('CONFLICT');
    const versions = await serviceDb().execute<{ version: number }>(sql`
      select version from public.brick_versions
      where brick_id = ${created.brickId}::uuid order by version
    `);
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
  });
});
