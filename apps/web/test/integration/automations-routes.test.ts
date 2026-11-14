// Route integration tests of the automation API (SPEC-711 ET-5, CA-3, CL-1 to CL-4).
//
// The real `handler()` runs (session, Zod validation, idempotency, problem+json); only the rate
// limiter and the origin guard are replaced by their no-op implementations. Postgres is real:
// RLS, the status checks and the row locks behave as in production.
import { randomUUID } from 'node:crypto';

import { testApiHandler } from 'next-test-api-route-handler';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { EVENT_AUTOMATION_KEYS } from '@learny/contracts';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createAutomationActionQuiet } from '@learny/services';

import { POST as acceptRoute } from '../../app/api/v1/me/automation-actions/[id]/accept/route';
import { POST as declineRoute } from '../../app/api/v1/me/automation-actions/[id]/decline/route';
import { POST as undoRoute } from '../../app/api/v1/me/automation-actions/[id]/undo/route';
import { GET as actionsRoute } from '../../app/api/v1/me/automation-actions/route';
import { GET as settingsRoute, PATCH as updateRoute } from '../../app/api/v1/me/automations/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

// `next-test-api-route-handler` receives the App Router module (one key per HTTP method).
const ACCEPT = { POST: acceptRoute };
const DECLINE = { POST: declineRoute };
const UNDO = { POST: undoRoute };
const ACTIONS = { GET: actionsRoute };
const SETTINGS = { GET: settingsRoute };
const UPDATE = { PATCH: updateRoute };

const PREFIX = 'sdd-711-routes-';
const AT = new Date('2026-11-11T12:20:00Z');

interface User {
  userId: string;
  email: string;
}

interface ApiAnswer {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

let restoreSession: () => void = () => undefined;

function asUser(user: User): void {
  restoreSession = setSessionResolver(() =>
    Promise.resolve({ userId: user.userId, email: user.email, emailConfirmed: true }),
  );
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email, timezone: 'Europe/Paris' })).id,
  );
  return { userId, email };
}

async function call(
  appHandler: unknown,
  options: {
    method?: string;
    id?: string;
    body?: unknown;
    idempotencyKey?: string;
    url?: string;
  } = {},
): Promise<ApiAnswer> {
  const id = options.id ?? '';
  const path = options.url ?? `/api/v1/me/automation-actions${id === '' ? '' : `/${id}/accept`}`;
  let answer: ApiAnswer = { status: 0, body: {}, headers: new Headers() };
  await testApiHandler({
    appHandler: appHandler as never,
    ...(id === '' ? {} : { params: { id } }),
    url: `http://localhost${path}`,
    test: async ({ fetch }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
      const response = await fetch({
        method: options.method ?? 'POST',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      answer = {
        status: response.status,
        body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
        headers: response.headers,
      };
    },
  });
  return answer;
}

async function pendingAction(
  userId: string,
  options: { dedupeKey?: string; status?: 'pending_consent' | 'expired' | 'consumed' } = {},
): Promise<string> {
  const created = await serviceDb().transaction((tx) =>
    createAutomationActionQuiet(tx, {
      userId,
      formationId: null,
      automation: 'reprise',
      kind: 'reprise_demo',
      summary: 'Séance de reprise de 15 min proposée',
      payload: { dedupeKey: options.dedupeKey ?? `route:${randomUUID()}` },
      requiresConsent: true,
      createdAt: AT,
    }),
  );
  const actionId = created.action?.id;
  if (actionId === undefined) throw new Error('action non créée');
  if (options.status === 'expired' || options.status === 'consumed') {
    await serviceDb().execute(sql`
      update public.automation_actions
      set status = ${options.status}::automation_status,
          decided_at = ${options.status === 'expired' ? AT.toISOString() : null}::timestamptz
      where id = ${actionId}::uuid
    `);
  }
  return actionId;
}

async function statusOf(actionId: string): Promise<string> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.automation_actions where id = ${actionId}::uuid`,
  );
  return rows[0]?.status ?? 'absent';
}

afterEach(async () => {
  restoreSession();
  restoreSession = () => undefined;
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-711] service et API', () => {
  it('CA-3 — la lecture des réglages et du journal passe par la session, sans fuite entre apprenants', async () => {
    setOriginGuard(noopOriginGuard);
    setRateLimiter(noopRateLimiter);
    const alex = await createUser('read');
    const other = await createUser('other');
    asUser(alex);

    const settings = await call(SETTINGS, { method: 'GET', url: '/api/v1/me/automations' });
    expect(settings.status).toBe(200);
    const items = settings.body.items as { automation: string; enabled: boolean }[];
    expect(items.map((item) => item.automation)).toEqual([...EVENT_AUTOMATION_KEYS]);
    expect(items.every((item) => item.enabled)).toBe(true);
    expect(settings.body.paused).toBe(false);

    await pendingAction(alex.userId, { dedupeKey: 'route:alex' });
    await pendingAction(other.userId, { dedupeKey: 'route:other' });
    const journal = await call(ACTIONS, {
      method: 'GET',
      url: '/api/v1/me/automation-actions?limit=20',
    });
    expect(journal.status).toBe(200);
    expect((journal.body.items as unknown[]).length).toBe(1);
    expect(journal.body.weekCount).toBe(1);

    // RLS + Zod : la ressource d'un autre apprenant répond 404, une requête invalide répond 400.
    const invalidQuery = await call(ACTIONS, {
      method: 'GET',
      url: '/api/v1/me/automation-actions?status=bogus',
    });
    expect(invalidQuery.status).toBe(400);
    expect(invalidQuery.body.code).toBe('VALIDATION_FAILED');
  });

  it('CA-3, CL-1 — les réglages valident le corps et refusent une entrée invalide sans écrire', async () => {
    setOriginGuard(noopOriginGuard);
    setRateLimiter(noopRateLimiter);
    const alex = await createUser('settings');
    asUser(alex);

    const updated = await call(UPDATE, {
      method: 'PATCH',
      url: '/api/v1/me/automations',
      body: { automation: 'pause', enabled: false },
    });
    expect(updated.status).toBe(200);
    expect(updated.body.enabled).toBe(false);

    const missingField = await call(UPDATE, {
      method: 'PATCH',
      url: '/api/v1/me/automations',
      body: { automation: 'pause' },
    });
    expect(missingField.status).toBe(400);
    expect(missingField.body.code).toBe('VALIDATION_FAILED');

    // Aucune définition de `pause` n'est livrée par SPEC-711 : ses paramètres sont refusés.
    const unknownSchema = await call(UPDATE, {
      method: 'PATCH',
      url: '/api/v1/me/automations',
      body: { automation: 'pause', params: { minutes: 5 } },
    });
    expect(unknownSchema.status).toBe(400);
    expect(unknownSchema.body.code).toBe('VALIDATION_FAILED');
  });

  it('CA-3, CL-1, CL-3, CL-4 — acceptation idempotente, 404 étranger, 409 expiré et 422 consommé', async () => {
    setOriginGuard(noopOriginGuard);
    setRateLimiter(noopRateLimiter);
    const alex = await createUser('decide');
    const other = await createUser('intruder');
    asUser(alex);

    const actionId = await pendingAction(alex.userId, { dedupeKey: 'route:accept' });
    const key = randomUUID();

    // ET-1 — une mutation rejouable exige sa clé d'idempotence.
    const noKey = await call(ACCEPT, { id: actionId, body: {} });
    expect(noKey.status).toBe(400);
    expect(noKey.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    // CL-1 — l'identifiant d'un autre apprenant est un 404, sans révéler son existence.
    asUser(other);
    const foreignAccept = await call(ACCEPT, {
      id: actionId,
      body: {},
      idempotencyKey: randomUUID(),
    });
    expect(foreignAccept.status).toBe(404);
    expect(foreignAccept.body.code).toBe('NOT_FOUND');
    expect(await statusOf(actionId)).toBe('pending_consent');
    asUser(alex);

    const accepted = await call(ACCEPT, { id: actionId, body: {}, idempotencyKey: key });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe('applied');

    // Une seconde acceptation avec la même clé est un rejeu, sans second effet.
    const replayed = await call(ACCEPT, { id: actionId, body: {}, idempotencyKey: key });
    expect(replayed.status).toBe(200);
    expect(replayed.body.status).toBe('applied');
    expect(replayed.headers.get('idempotent-replayed')).toBe('true');

    // Une nouvelle clé sur une action déjà traitée reste idempotente côté service.
    const second = await call(ACCEPT, {
      id: actionId,
      body: { choice: { creneau: '2026-11-12T09:00:00.000Z' } },
      idempotencyKey: randomUUID(),
    });
    expect(second.status).toBe(200);
    expect(second.body.status).toBe('applied');

    // CL-3 — une action expirée ne peut plus être acceptée : 409.
    const expiredId = await pendingAction(alex.userId, {
      dedupeKey: 'route:expired',
      status: 'expired',
    });
    const expired = await call(ACCEPT, {
      id: expiredId,
      body: {},
      idempotencyKey: randomUUID(),
    });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('CONFLICT');
    expect(await statusOf(expiredId)).toBe('expired');

    // CL-4 — une action consommée refuse l'annulation avec 422 et garde son historique.
    const consumedId = await pendingAction(alex.userId, {
      dedupeKey: 'route:consumed',
      status: 'consumed',
    });
    const undo = await call(UNDO, {
      id: consumedId,
      body: {},
      idempotencyKey: randomUUID(),
      url: `/api/v1/me/automation-actions/${consumedId}/undo`,
    });
    expect(undo.status).toBe(422);
    expect(undo.body.code).toBe('AUTOMATION_ACTION_CONSUMED');
    expect(await statusOf(consumedId)).toBe('consumed');

    // CL-1 — un autre apprenant reçoit 404 sur les actions d'Alex.
    asUser(other);
    const foreignUndo = await call(UNDO, {
      id: expiredId,
      body: {},
      idempotencyKey: randomUUID(),
      url: `/api/v1/me/automation-actions/${expiredId}/undo`,
    });
    expect(foreignUndo.status).toBe(404);
    const foreignDecline = await call(DECLINE, {
      id: expiredId,
      body: {},
      idempotencyKey: randomUUID(),
      url: `/api/v1/me/automation-actions/${expiredId}/decline`,
    });
    expect(foreignDecline.status).toBe(404);
  });
});
