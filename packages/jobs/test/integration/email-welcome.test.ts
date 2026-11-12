// Welcome e-mail function (SPEC-204 ET-6, EF-6, CA-5, CL-1): one message per sign-up, replayed
// without a second delivery, skipped when the learner disabled the e-mail channel, and a
// definitive transport rejection is not retried.
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clock } from '@learny/core';
import { closeDb, schema, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import {
  EmailRejectedError,
  clearOutbox,
  listOutbox,
  memoryTransport,
  setTransport,
} from '@learny/notifications/email';

import { emailWelcome, executeFunctionInline, type InlineEvent } from '../../src';

const PREFIX = 'sdd-204-welcome-';
const { profiles } = schema;
const created: string[] = [];

async function createLearner(channelEmail = true): Promise<{ id: string; email: string }> {
  const email = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  const id = await serviceDb().transaction(
    async (tx) =>
      (
        await createTestUser(tx, {
          email,
          firstName: 'Alex',
        })
      ).id,
  );
  created.push(id);
  await serviceDb().update(profiles).set({ tutorTone: 'tu' }).where(eq(profiles.id, id));
  if (!channelEmail) {
    await serviceDb().execute(
      sql`update public.notification_settings set channel_email = false where user_id = ${id}::uuid`,
    );
  }
  return { id, email };
}

const event = (userId: string): InlineEvent => ({
  id: `signed-up:${userId}`,
  name: 'user/signed-up',
  data: { userId, method: 'password', signedUpAt: clock.now().toISOString() },
  ts: clock.now().getTime(),
});

beforeAll(() => {
  setTransport(memoryTransport);
});

beforeEach(() => {
  clearOutbox();
});

afterEach(() => {
  clearOutbox();
  setTransport(memoryTransport);
});

afterAll(async () => {
  setTransport(undefined);
  for (const id of created) {
    await serviceDb().execute(sql`delete from auth.users where id = ${id}::uuid`);
  }
  await closeDb();
});

describe('[SPEC-204] fonction de bienvenue', () => {
  it('CA-5 / CL-1 — un seul e-mail, même rejoué', async () => {
    const learner = await createLearner();
    const first = await executeFunctionInline(emailWelcome, event(learner.id));
    const second = await executeFunctionInline(emailWelcome, event(learner.id));
    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');
    expect(listOutbox()).toHaveLength(1);
    const [entry] = listOutbox();
    expect(entry?.message.subject).toBe('Bienvenue sur Learny');
    expect(entry?.message.to).toBe(learner.email);
    expect(entry?.message.text).toContain('Ton compte est prêt');
    expect(entry?.idempotencyKey).toBe(`welcome:${learner.id}`);
  });

  it('CA-5 — préférence coupée : aucun envoi, la fonction termine', async () => {
    const learner = await createLearner(false);
    const result = await executeFunctionInline(emailWelcome, event(learner.id));
    expect(result.status).toBe('completed');
    expect(result.output).toEqual({ sent: false });
    expect(listOutbox()).toHaveLength(0);
  });

  it('ET-6 — un refus définitif du transport n’est pas réessayé', async () => {
    const learner = await createLearner();
    setTransport({
      name: 'memory',
      send: () => Promise.reject(new EmailRejectedError('adresse rejetée', 422)),
    });
    const result = await executeFunctionInline(emailWelcome, event(learner.id));
    expect(result.status).toBe('failed');
    expect(result.executions).toBe(1);
    expect(result.error?.name).toBe('NonRetriableError');
  });
});
