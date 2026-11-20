// Integration tests of the three global-quiz routes (SPEC-701 §12, ET-2).
// The route wrapper runs for real (session, validation, problem+json); only the rate limiter and
// the origin guard are replaced by their no-op implementations.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  GlobalQuizSessionDtoSchema,
  ReviewAnswerResultDtoSchema,
  ReviewSummaryDtoSchema,
} from '@learny/contracts';
import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { noopOriginGuard, setOriginGuard } from '@learny/http/origin';
import { noopRateLimiter, setRateLimiter } from '@learny/http/rate-limit';
import { setSessionResolver } from '@learny/http/session';
import { createBrick, createServiceContext } from '@learny/services';
import { createNotionState } from '@learny/testing';
import { requestApi, setApiAppFactory } from '@learny/testing/api';

import { createApp } from '../../src/app';

import { honoRoute } from './hono-route';

const TODAY = honoRoute('/api/v1/formations/[fid]/global-quiz/today', 'GET');
const ANSWERS = honoRoute('/api/v1/review-sessions/[sid]/answers', 'POST');
const COMPLETE = honoRoute('/api/v1/review-sessions/[sid]/complete', 'POST');

setApiAppFactory(createApp);
const PREFIX = 'sdd-701-api-';
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
  notionId: string;
  brickId: string;
}

let restoreSession: () => void = () => undefined;

function asUser(fx: Fixture): void {
  restoreSession = setSessionResolver(() =>
    Promise.resolve({ userId: fx.userId, email: fx.email, emailConfirmed: true }),
  );
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
}

async function fixture(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
    });
    await tx.execute(sql`
      update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid
    `);
    return { user, programme };
  });
  const notionId = base.programme.notionIds[0] as string;
  const ctx = createServiceContext({
    userId: base.user.id,
    email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
  const brick = await createBrick(ctx, {
    type: 'recall_card',
    formationId: base.programme.formationId,
    purpose: 'review',
    origin: 'tutor',
    notionIds: [notionId],
    payload: {
      front: 'Que définit une variante d’exercice comptable ?',
      back: 'Le nombre de périodes comptables d’un exercice.',
      sourceLabel: 'votre cours du module 1, chapitre 1',
      sources: [],
    },
    createdBy: 'tutor',
  });
  if (!brick.ok) throw brick.error;
  await serviceDb().transaction(async (tx) => {
    await createNotionState(tx, {
      userId: base.user.id,
      notionId,
      dueAt: new Date('2026-11-11T08:00:00Z'),
    });
  });
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    notionId,
    brickId: brick.value.brickId,
  };
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

describe.each(['hono'] as const)('[SPEC-701] API quiz global [SPEC-1101] (%s)', (target) => {
  it('GET renvoie 200 avec le schéma du DTO et 400 sur un mode inconnu', async () => {
    const fx = await fixture('get');
    asUser(fx);
    await requestApi(target, {
      appHandler: { GET: TODAY },
      params: { fid: fx.formationId },
      url: `http://localhost/api/v1/formations/${fx.formationId}/global-quiz/today`,
      test: async ({ fetch }) => {
        const response = await fetch({ method: 'GET' });
        expect(response.status).toBe(200);
        const dto = GlobalQuizSessionDtoSchema.parse(await response.json());
        expect(dto.items).toHaveLength(1);
        expect(dto.items[0]?.type).toBe('recall_card');
      },
    });

    await requestApi(target, {
      appHandler: { GET: TODAY },
      params: { fid: fx.formationId },
      url: `http://localhost/api/v1/formations/${fx.formationId}/global-quiz/today?mode=inconnu`,
      test: async ({ fetch }) => {
        const invalid = await fetch({ method: 'GET' });
        expect(invalid.status).toBe(400);
        const body = (await invalid.json()) as { code: string };
        expect(body.code).toBe('VALIDATION_FAILED');
      },
    });
  });

  it('GET renvoie 404 sur la formation d’un autre apprenant', async () => {
    const owner = await fixture('owner');
    const stranger = await fixture('stranger');
    asUser(stranger);
    await requestApi(target, {
      appHandler: { GET: TODAY },
      params: { fid: owner.formationId },
      url: `http://localhost/api/v1/formations/${owner.formationId}/global-quiz/today`,
      test: async ({ fetch }) => {
        const response = await fetch({ method: 'GET' });
        expect(response.status).toBe(404);
      },
    });
  });

  it('POST répond 200, rejoue le même clientAnswerId, puis 409, clôture et 422', async () => {
    const fx = await fixture('answers');
    asUser(fx);
    let sessionId = '';
    await requestApi(target, {
      appHandler: { GET: TODAY },
      params: { fid: fx.formationId },
      url: `http://localhost/api/v1/formations/${fx.formationId}/global-quiz/today`,
      test: async ({ fetch }) => {
        const dto = GlobalQuizSessionDtoSchema.parse(await (await fetch({ method: 'GET' })).json());
        sessionId = dto.sessionId ?? '';
      },
    });
    expect(sessionId).not.toBe('');

    const clientAnswerId = randomUUID();
    const answerUrl = `http://localhost/api/v1/review-sessions/${sessionId}/answers`;
    const body = JSON.stringify({
      position: 0,
      clientAnswerId,
      timeMs: 1_200,
      response: { selfRating: 'good' },
    });

    await requestApi(target, {
      appHandler: { POST: ANSWERS },
      params: { sid: sessionId },
      url: answerUrl,
      test: async ({ fetch }) => {
        const first = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        expect(first.status).toBe(200);
        const result = ReviewAnswerResultDtoSchema.parse(await first.json());
        expect(result.isCorrect).toBe(true);

        const replay = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        expect(replay.status).toBe(200);
        expect(ReviewAnswerResultDtoSchema.parse(await replay.json())).toEqual(result);

        const conflict = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...JSON.parse(body), clientAnswerId: randomUUID() }),
        });
        expect(conflict.status).toBe(409);
        expect(((await conflict.json()) as { code: string }).code).toBe('CONFLICT');
      },
    });

    await requestApi(target, {
      appHandler: { POST: COMPLETE },
      params: { sid: sessionId },
      url: `http://localhost/api/v1/review-sessions/${sessionId}/complete`,
      test: async ({ fetch }) => {
        const closed = await fetch({ method: 'POST' });
        expect(closed.status).toBe(200);
        const summary = ReviewSummaryDtoSchema.parse(await closed.json());
        expect(summary.reviewedCount).toBe(1);
        expect(summary.okCount).toBe(1);
      },
    });

    await requestApi(target, {
      appHandler: { POST: ANSWERS },
      params: { sid: sessionId },
      url: answerUrl,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            position: 0,
            clientAnswerId: randomUUID(),
            timeMs: 0,
            skipped: true,
          }),
        });
        expect(response.status).toBe(422);
        expect(((await response.json()) as { code: string }).code).toBe('SESSION_CLOSED');
      },
    });
  });

  it('POST renvoie 400 quand skipped et response sont fournis ensemble', async () => {
    const fx = await fixture('invalid');
    asUser(fx);
    let sessionId = '';
    await requestApi(target, {
      appHandler: { GET: TODAY },
      params: { fid: fx.formationId },
      url: `http://localhost/api/v1/formations/${fx.formationId}/global-quiz/today`,
      test: async ({ fetch }) => {
        const dto = GlobalQuizSessionDtoSchema.parse(await (await fetch({ method: 'GET' })).json());
        sessionId = dto.sessionId ?? '';
      },
    });
    await requestApi(target, {
      appHandler: { POST: ANSWERS },
      params: { sid: sessionId },
      url: `http://localhost/api/v1/review-sessions/${sessionId}/answers`,
      test: async ({ fetch }) => {
        const response = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            position: 0,
            clientAnswerId: randomUUID(),
            timeMs: 0,
            skipped: true,
            response: { selfRating: 'good' },
          }),
        });
        expect(response.status).toBe(400);
      },
    });
  });
});
