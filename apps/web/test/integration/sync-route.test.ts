// Integration tests of `POST /api/v1/sync/offline-answers` (SPEC-801 §12): validation of the batch
// (400), unauthenticated access (401) and a mixed batch answered 200 with one result per entry.
import { randomUUID } from 'node:crypto';

import { beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';

import { createApp } from '@learny/api';
import { OfflineSyncResponseSchema, type GlobalQuizSessionDto } from '@learny/contracts';
import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createBrick, createServiceContext } from '@learny/services';
import { createNotionState } from '@learny/testing';
import { type ApiTarget, requestApi, setApiAppFactory } from '@learny/testing/api';

import { GET as TODAY } from '../../app/api/v1/formations/[fid]/global-quiz/today/route';
import { POST as SYNC } from '../../app/api/v1/sync/offline-answers/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

let apiTarget: ApiTarget = 'next';

setApiAppFactory(createApp);

const PREFIX = 'sdd-801-api-';
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
}

let restoreSession: () => void = () => undefined;

function asUser(fx: Fixture): void {
  restoreSession = setSessionResolver(() =>
    Promise.resolve({ userId: fx.userId, email: fx.email, emailConfirmed: true }),
  );
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
}

async function fixture(): Promise<Fixture> {
  const email = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
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
  return { userId: base.user.id, email, formationId: base.programme.formationId };
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

async function sessionOf(formationId: string): Promise<GlobalQuizSessionDto> {
  let dto: GlobalQuizSessionDto | undefined;
  await requestApi(apiTarget, {
    appHandler: { GET: TODAY },
    params: { fid: formationId },
    url: `http://localhost/api/v1/formations/${formationId}/global-quiz/today`,
    test: async ({ fetch }) => {
      dto = (await (await fetch({ method: 'GET' })).json()) as GlobalQuizSessionDto;
    },
  });
  if (dto === undefined) throw new Error('session absente');
  return dto;
}

function answerEntry(formationId: string, sessionId: string, clientId: string, answeredAt: string) {
  return {
    clientId,
    kind: 'answer' as const,
    formationId,
    sessionId,
    position: 0,
    answeredAt,
    response: { selfRating: 'good' },
  };
}

describe.each(['next', 'hono'] as const)(
  '[SPEC-801] API de synchronisation [SPEC-1101] (%s)',
  (target) => {
    beforeEach(() => {
      apiTarget = target;
    });
    it('répond 401 sans session', async () => {
      setOriginGuard(noopOriginGuard);
      setRateLimiter(noopRateLimiter);
      restoreSession = setSessionResolver(() => Promise.resolve(null));
      await requestApi(apiTarget, {
        appHandler: { POST: SYNC },
        url: 'http://localhost/api/v1/sync/offline-answers',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entries: [] }),
          });
          expect(response.status).toBe(401);
        },
      });
    });

    it('répond 400 au-delà de 50 entrées', async () => {
      const fx = await fixture();
      asUser(fx);
      const session = await sessionOf(fx.formationId);
      const entries = Array.from({ length: 51 }, () =>
        answerEntry(
          fx.formationId,
          session.sessionId ?? '',
          randomUUID(),
          '2026-11-11T10:00:00.000Z',
        ),
      );
      await requestApi(apiTarget, {
        appHandler: { POST: SYNC },
        url: 'http://localhost/api/v1/sync/offline-answers',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entries }),
          });
          expect(response.status).toBe(400);
        },
      });
    });

    it('répond 200 avec un résultat par entrée (lot mixte, CL-11)', async () => {
      const fx = await fixture();
      asUser(fx);
      const session = await sessionOf(fx.formationId);
      const sessionId = session.sessionId as string;
      const entries = [
        answerEntry(fx.formationId, sessionId, randomUUID(), '2026-11-11T10:00:00.000Z'),
        answerEntry(fx.formationId, sessionId, randomUUID(), '2026-11-01T10:00:00.000Z'),
      ];
      await requestApi(apiTarget, {
        appHandler: { POST: SYNC },
        url: 'http://localhost/api/v1/sync/offline-answers',
        test: async ({ fetch }) => {
          const response = await fetch({
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ entries }),
          });
          expect(response.status).toBe(200);
          const body = OfflineSyncResponseSchema.parse(await response.json());
          expect(body.results).toHaveLength(2);
          expect(body.results.map((result) => result.status)).toEqual(['rejected', 'applied']);
        },
      });
    });
  },
);
