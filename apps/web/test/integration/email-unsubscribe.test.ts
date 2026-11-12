// One-click unsubscribe route (SPEC-204 EF-5, ET-7, CA-4, CL-6): POST of a valid token disables
// the e-mail channel, any alteration is a 400, and GET never changes state.
import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createUnsubscribeToken, emailConfig } from '@learny/notifications/email';

import { GET, POST } from '../../app/api/v1/email/unsubscribe/route';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const users: { id: string; email: string }[] = [];

async function createLearner(): Promise<{ id: string; email: string; token: string }> {
  const email = `sdd-204-unsub-${randomUUID().slice(0, 8)}@test.learny.test`;
  const id = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email, firstName: 'Alex' })).id,
  );
  users.push({ id, email });
  return { id, email, token: createUnsubscribeToken(emailConfig().linkSecret, id) };
}

function request(path: string, method: 'GET' | 'POST', accept?: string): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: accept === undefined ? {} : { accept },
    ...(method === 'POST'
      ? {
          body: 'List-Unsubscribe=One-Click',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...(accept === undefined ? {} : { accept }),
          },
        }
      : {}),
  });
}

async function channelEmail(userId: string): Promise<boolean | undefined> {
  const rows = await serviceDb().execute<{ channelEmail: boolean }>(
    sql`select channel_email as "channelEmail" from public.notification_settings where user_id = ${userId}::uuid`,
  );
  return rows[0]?.channelEmail;
}

beforeAll(() => {
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  for (const user of users) {
    await serviceDb().execute(sql`delete from auth.users where id = ${user.id}::uuid`);
  }
  await closeDb();
});

describe('[SPEC-204] désinscription', () => {
  it('CA-4 — GET affiche le formulaire et ne change rien', async () => {
    const learner = await createLearner();
    const response = await GET(
      request(`/api/v1/email/unsubscribe?token=${learner.token}`, 'GET'),
      NO_SEGMENT,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    const html = await response.text();
    expect(html).toContain('Ne plus recevoir les e-mails de rappel de Learny ?');
    expect(html).toContain('Les e-mails liés à la sécurité de votre compte');
    expect(html).toContain('Confirmer');
    expect(html).toContain(`/api/v1/email/unsubscribe?token=${learner.token}`);
    expect(await channelEmail(learner.id)).toBe(true);
  });

  it('CA-4 — POST d’un jeton valide coupe channel_email (JSON)', async () => {
    const learner = await createLearner();
    const response = await POST(
      request(`/api/v1/email/unsubscribe?token=${learner.token}`, 'POST', 'application/json'),
      NO_SEGMENT,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: true });
    expect(await channelEmail(learner.id)).toBe(false);
  });

  it('CA-4 — POST depuis la page renvoie la confirmation HTML', async () => {
    const learner = await createLearner();
    const response = await POST(
      request(`/api/v1/email/unsubscribe?token=${learner.token}`, 'POST'),
      NO_SEGMENT,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('C’est fait. Vous pouvez réactiver les e-mails dans Paramètres');
    expect(await channelEmail(learner.id)).toBe(false);
  });

  it('CA-4 / CL-5 — un jeton altéré renvoie 400 sans rien changer', async () => {
    const learner = await createLearner();
    const last = learner.token.at(-1);
    const altered = `${learner.token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`;

    const json = await POST(
      request(`/api/v1/email/unsubscribe?token=${altered}`, 'POST', 'application/json'),
      NO_SEGMENT,
    );
    expect(json.status).toBe(400);
    expect(await json.json()).toMatchObject({ code: 'UNSUBSCRIBE_TOKEN_INVALID' });

    const html = await POST(
      request(`/api/v1/email/unsubscribe?token=${altered}`, 'POST'),
      NO_SEGMENT,
    );
    expect(html.status).toBe(400);
    expect(await html.text()).toContain('Ce lien n’est plus valide.');
    expect(await channelEmail(learner.id)).toBe(true);
  });

  it('GET d’un jeton altéré : page 400, aucun changement d’état', async () => {
    const learner = await createLearner();
    const response = await GET(
      request(`/api/v1/email/unsubscribe?token=invalide`, 'GET'),
      NO_SEGMENT,
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Ce lien n’est plus valide.');
    expect(await channelEmail(learner.id)).toBe(true);
  });

  it('une réponse HTML ne passe pas par le format problem+json', async () => {
    const learner = await createLearner();
    const response = await POST(
      request(`/api/v1/email/unsubscribe?token=${learner.token}`, 'POST'),
      NO_SEGMENT,
    );
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('<!DOCTYPE html>');
  });
});
