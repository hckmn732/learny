// Integration tests of the two brick routes (SPEC-501 ET-9, EF-3, EF-4, EF-7, CA-6).
// The route wrapper runs for real (session, validation, idempotency, problem+json); only the rate
// limiter and the origin guard are replaced by their no-op implementations.
import { randomUUID } from 'node:crypto';

import { testApiHandler } from 'next-test-api-route-handler';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import {
  createBrick,
  createServiceContext,
  retireBrick,
  type ServiceContext,
} from '@learny/services';

import { POST as REPORT } from '../../app/api/v1/bricks/[bid]/report/route';
import { PATCH } from '../../app/api/v1/bricks/[bid]/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

const PREFIX = 'sdd-501-routes-';
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
  brickId: string;
  versionId: string;
  ctx: ServiceContext;
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

async function fixture(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
    });
    return { user, programme };
  });
  const ctx = createServiceContext({
    userId: base.user.id,
    email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
  const created = await createBrick(ctx, {
    type: 'choice_question',
    formationId: base.programme.formationId,
    purpose: 'bank',
    notionIds: [base.programme.notionIds[0] as string],
    origin: 'tutor',
    payload: choicePayload(base.programme.notionIds),
    createdBy: 'tutor',
  });
  if (!created.ok) throw created.error;
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    notionIds: base.programme.notionIds,
    brickId: created.value.brickId,
    versionId: created.value.versionId,
    ctx,
  };
}

let restoreSession: () => void = () => undefined;

function asUser(fx: Fixture): void {
  restoreSession = setSessionResolver(() =>
    Promise.resolve({ userId: fx.userId, email: fx.email, emailConfirmed: true }),
  );
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
}

afterEach(() => {
  restoreSession();
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-501] routes des briques', () => {
  it('PATCH corrige une brique et renvoie 200 (EF-4)', async () => {
    const fx = await fixture('patch');
    asUser(fx);
    await testApiHandler({
      appHandler: { PATCH },
      params: { bid: fx.brickId },
      url: `http://localhost/api/v1/bricks/${fx.brickId}`,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 1,
            payload: choicePayload(fx.notionIds, 'Correction par la route ?'),
          }),
        });
        expect(response.status).toBe(200);
        const body = (await response.json()) as { brickId: string; version: number };
        expect(body.brickId).toBe(fx.brickId);
        expect(body.version).toBe(2);
      },
    });
  });

  it('PATCH renvoie 409 sur version obsolète et 422 BRICK_INVALID', async () => {
    const fx = await fixture('patch-errors');
    asUser(fx);
    await testApiHandler({
      appHandler: { PATCH },
      params: { bid: fx.brickId },
      url: `http://localhost/api/v1/bricks/${fx.brickId}`,
      test: async ({ fetch }) => {
        const stale = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 9, payload: choicePayload(fx.notionIds) }),
        });
        expect(stale.status).toBe(409);

        const invalid = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 1, payload: { stem: 'x' } }),
        });
        expect(invalid.status).toBe(422);
        const body = (await invalid.json()) as {
          code: string;
          errors?: { code?: string }[];
        };
        expect(body.code).toBe('BRICK_INVALID');
        expect(body.errors?.some((issue) => issue.code === 'SCHEMA_INVALID')).toBe(true);
      },
    });
  });

  it('PATCH renvoie 404 sur la brique d’un autre utilisateur (CA-6)', async () => {
    const alice = await fixture('alice');
    const bob = await fixture('bob');
    asUser(bob);
    await testApiHandler({
      appHandler: { PATCH },
      params: { bid: alice.brickId },
      url: `http://localhost/api/v1/bricks/${alice.brickId}`,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: 1, payload: choicePayload(bob.notionIds) }),
        });
        expect(response.status).toBe(404);
      },
    });
  });

  it('POST signale en 201 puis 200, et 422 sur brique retirée (EF-3, CL-9)', async () => {
    const fx = await fixture('report');
    asUser(fx);
    await testApiHandler({
      appHandler: { POST: REPORT },
      params: { bid: fx.brickId },
      url: `http://localhost/api/v1/bricks/${fx.brickId}/report`,
      test: async ({ fetch }) => {
        const first = await fetch({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `report-${randomUUID()}`,
          },
          body: JSON.stringify({ reason: 'Formulation ambiguë.' }),
        });
        expect(first.status).toBe(201);
        const body = (await first.json()) as { reportId: string; status: string };
        expect(body.status).toBe('open');

        const second = await fetch({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `report-${randomUUID()}`,
          },
          body: JSON.stringify({ reason: 'Encore une fois.' }),
        });
        expect(second.status).toBe(200);
        expect(((await second.json()) as { reportId: string }).reportId).toBe(body.reportId);
      },
    });

    await retireBrick(fx.ctx, fx.brickId);
    await testApiHandler({
      appHandler: { POST: REPORT },
      params: { bid: fx.brickId },
      url: `http://localhost/api/v1/bricks/${fx.brickId}/report`,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': `report-${randomUUID()}`,
          },
          body: JSON.stringify({ reason: 'Brique retirée.' }),
        });
        expect(response.status).toBe(422);
        expect(((await response.json()) as { code: string }).code).toBe('BRICK_RETIRED');
      },
    });
  });
});
