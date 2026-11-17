// Integration tests of the legal acceptance service (SPEC-806 §12; CA-2, CA-3).
//
// Real Postgres with the owner role for the factories and the learner role for every service call:
// the two acceptances commit together, RLS isolates two learners, and the server guard refuses a
// formation mutation after a version change while export and deletion stay available. The clock is
// frozen and advanced explicitly (ADR-0047).
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, listLegalAcceptances, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import { createServiceContext, type ServiceContext } from '../../src/context';
import {
  acceptLegalVersions,
  enforceLegalAcceptance,
  requireCurrentLegalAcceptance,
} from '../../src/legal/accept';

const PREFIX = 'sdd-806-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const VERSIONS = { cgu: '2026-11-11', privacy: '2026-11-11' };
const UPDATED = { cgu: '2027-01-01', privacy: '2027-02-01' };

class TestClock implements Clock {
  private current = new Date(FIXED);

  now(): Date {
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

function context(userId: string, email: string, clock: TestClock): ServiceContext {
  return createServiceContext({ userId, email, requestId: randomUUID(), clock });
}

async function createUser(label: string): Promise<{ id: string; email: string }> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const row = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  return { id: row.id, email: row.email };
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

async function storedAcceptances(
  ctx: ServiceContext,
  userId: string,
): Promise<{ document: string; version: string; acceptedAt: Date }[]> {
  const { db } = ctx;
  if (db === null) throw new Error('contexte sans base');
  return db.run(async (tx) => {
    const rows = await listLegalAcceptances(tx, { userId });
    return rows.map((row) => ({
      document: row.document,
      version: row.version,
      acceptedAt: row.acceptedAt,
    }));
  });
}

beforeAll(async () => {
  await cleanup();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanup();
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-806] legal persistence', () => {
  it('CA-2 — un accord valide écrit les deux lignes atomiques avec les versions exactes', async () => {
    const user = await createUser('accept');
    const clock = new TestClock();
    const ctx = context(user.id, user.email, clock);

    const state = await acceptLegalVersions(
      ctx,
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );
    expect(state).toEqual({
      cguVersion: VERSIONS.cgu,
      privacyVersion: VERSIONS.privacy,
      acceptedAt: FIXED.toISOString(),
      complete: true,
    });

    const rows = await storedAcceptances(ctx, user.id);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => `${row.document}:${row.version}`).sort()).toEqual([
      `cgu:${VERSIONS.cgu}`,
      `privacy:${VERSIONS.privacy}`,
    ]);
    expect(new Set(rows.map((row) => row.acceptedAt.toISOString()))).toEqual(
      new Set([FIXED.toISOString()]),
    );

    const profile = await serviceDb().execute<{ terms: string | null }>(sql`
      select terms_version as terms from public.profiles where id = ${user.id}::uuid
    `);
    expect(profile[0]?.terms).toBe(`cgu:${VERSIONS.cgu};privacy:${VERSIONS.privacy}`);
  });

  it('CA-2 — une version obsolète est refusée sans ligne partielle et un rejeu reste unique', async () => {
    const user = await createUser('replay');
    const clock = new TestClock();
    const ctx = context(user.id, user.email, clock);

    await expect(
      acceptLegalVersions(
        ctx,
        { cguVersion: '2026-10-01', privacyVersion: VERSIONS.privacy },
        VERSIONS,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await storedAcceptances(ctx, user.id)).toHaveLength(0);

    const first = await acceptLegalVersions(
      ctx,
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );
    clock.advance(60 * 60 * 1000);
    const replay = await acceptLegalVersions(
      ctx,
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );
    expect(replay.acceptedAt).toBe(first.acceptedAt);
    const rows = await storedAcceptances(ctx, user.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.acceptedAt.toISOString() === FIXED.toISOString())).toBe(true);
  });

  it('CA-2 — la lecture des acceptations est isolée entre deux apprenants', async () => {
    const a = await createUser('a');
    const b = await createUser('b');
    const clock = new TestClock();
    const ctxA = context(a.id, a.email, clock);
    const ctxB = context(b.id, b.email, clock);

    await acceptLegalVersions(
      ctxA,
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );
    await acceptLegalVersions(
      ctxB,
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );

    expect(await storedAcceptances(ctxA, a.id)).toHaveLength(2);
    expect(await storedAcceptances(ctxB, a.id)).toHaveLength(0);
    expect(await storedAcceptances(ctxB, b.id)).toHaveLength(2);
  });

  it('CA-3 — après une nouvelle version, la mutation est refusée, l’export et la suppression restent possibles', async () => {
    const user = await createUser('guard');
    const clock = new TestClock();
    const ctx = context(user.id, user.email, clock);
    await acceptLegalVersions(
      ctx,
      { cguVersion: VERSIONS.cgu, privacyVersion: VERSIONS.privacy },
      VERSIONS,
    );

    vi.stubEnv('LEGAL_CGU_VERSION', UPDATED.cgu);
    vi.stubEnv('LEGAL_PRIVACY_VERSION', UPDATED.privacy);
    await expect(requireCurrentLegalAcceptance(ctx, UPDATED)).rejects.toMatchObject({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
      errors: [
        { code: 'EXPECTED_VERSION', path: 'cguVersion', message: UPDATED.cgu },
        { code: 'EXPECTED_VERSION', path: 'privacyVersion', message: UPDATED.privacy },
      ],
    });
    await expect(enforceLegalAcceptance(ctx, 'formations.create')).rejects.toMatchObject({
      code: 'LEGAL_ACCEPTANCE_REQUIRED',
    });
    await expect(enforceLegalAcceptance(ctx, 'me.export.request')).resolves.toBeUndefined();
    await expect(enforceLegalAcceptance(ctx, 'me.deletion.schedule')).resolves.toBeUndefined();
    await expect(enforceLegalAcceptance(ctx, 'me.legal.accept')).resolves.toBeUndefined();

    clock.advance(60 * 1000);
    await acceptLegalVersions(
      ctx,
      { cguVersion: UPDATED.cgu, privacyVersion: UPDATED.privacy },
      UPDATED,
    );
    await expect(requireCurrentLegalAcceptance(ctx, UPDATED)).resolves.toBeUndefined();
    expect(await storedAcceptances(ctx, user.id)).toHaveLength(4);
  });
});
