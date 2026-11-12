// Integration tests of the e-mail service (SPEC-204 §12): real Postgres for the profile and the
// preferences, memory transport for the assertions, and a real SMTP send to Mailpit when the local
// stack answers (skipped otherwise, CI uses memory). The welcome function is exercised in
// `packages/jobs/test/integration/email-welcome.test.ts` (it depends on @learny/jobs).
import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { clock } from '@learny/core';
import { logger } from '@learny/core/server';
import { closeDb, schema, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  canSendServiceEmail,
  clearOutbox,
  disableEmailChannel,
  emailConfig,
  listOutbox,
  memoryTransport,
  resetEmailConfig,
  sendEmail,
  setTransport,
  type EmailContext,
} from '../../src/email';

const PREFIX = 'sdd-204-';
const { profiles } = schema;

interface Learner {
  id: string;
  email: string;
}

const learners: Learner[] = [];

async function createLearner(
  options: {
    tone?: 'vous' | 'tu';
    channelEmail?: boolean;
    firstName?: string | null;
  } = {},
): Promise<Learner> {
  const email = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  const id = await serviceDb().transaction(
    async (tx) =>
      (
        await createTestUser(tx, {
          email,
          ...(options.firstName === null
            ? { meta: { first_name: null } }
            : { firstName: options.firstName ?? 'Alex' }),
        })
      ).id,
  );
  const learner = { id, email };
  learners.push(learner);
  await serviceDb()
    .update(profiles)
    .set({ tutorTone: options.tone ?? 'vous' })
    .where(eq(profiles.id, id));
  if (options.channelEmail === false) {
    await disableEmailChannel({ sdb: serviceDb(), clock, logger }, id);
  }
  return learner;
}

const context = (): EmailContext => ({ sdb: serviceDb(), clock, logger });

const mailpitBase = () => (process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025').replace(/\/+$/, '');

async function mailpitAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${mailpitBase()}/api/v1/messages?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

async function mailpitSubjects(): Promise<string[]> {
  const response = await fetch(`${mailpitBase()}/api/v1/messages?limit=50`);
  if (!response.ok) return [];
  const body = (await response.json()) as { messages: { Subject: string }[] };
  return body.messages.map((message) => message.Subject);
}

beforeAll(() => {
  setTransport(memoryTransport);
});

beforeEach(() => {
  clearOutbox();
});

afterEach(() => {
  clearOutbox();
  resetEmailConfig();
  setTransport(memoryTransport);
  vi.unstubAllEnvs();
});

afterAll(async () => {
  setTransport(undefined);
  resetEmailConfig();
  if (learners.length > 0) {
    for (const learner of learners) {
      await serviceDb().execute(sql`delete from auth.users where id = ${learner.id}::uuid`);
    }
  }
  await closeDb();
});

describe('[SPEC-204] e-mails', () => {
  it('EF-1 — sendEmail lit l’adresse et le ton du profil', async () => {
    const learner = await createLearner({ tone: 'tu' });
    const result = await sendEmail(context(), {
      userId: learner.id,
      template: 'welcome',
      props: { firstName: 'Alex' },
      idempotencyKey: `welcome:${learner.id}`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('service');
    const [entry] = listOutbox();
    expect(entry?.message.to).toBe(learner.email);
    expect(entry?.message.text).toContain('Ton compte est prêt');
    expect(entry?.message.text).not.toMatch(/\b(vous|votre|vos)\b/i);
    expect(entry?.message.headers['List-Unsubscribe']).toContain(
      '/api/v1/email/unsubscribe?token=',
    );
  });

  it('CA-5 / CL-3 — préférence coupée : service bloqué, transactionnel envoyé', async () => {
    const learner = await createLearner({ channelEmail: false });
    expect(await canSendServiceEmail(context(), learner.id)).toBe(false);

    const transactional = await sendEmail(context(), {
      userId: learner.id,
      template: 'export_ready',
      props: {
        downloadUrl: 'https://learny.example/exports/archive.zip?token=exemple',
        sizeLabel: '42 Mo',
        expiresLabel: 'mercredi 18 novembre à 13:20',
      },
      idempotencyKey: `export:${learner.id}`,
    });
    expect(transactional.ok).toBe(true);
    expect(listOutbox()).toHaveLength(1);
    expect(listOutbox()[0]?.message.headers['List-Unsubscribe']).toBeUndefined();
  });

  it('EF-1 — profil absent : NOT_FOUND avec le client réel', async () => {
    const result = await sendEmail(context(), {
      userId: '00000000-0000-4000-8000-000000000204',
      template: 'welcome',
      props: { firstName: null },
      idempotencyKey: 'welcome:absent',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('CA-6 — EMAIL_MODE=smtp : l’e-mail arrive dans Mailpit', async (ctx) => {
    if (!(await mailpitAvailable())) {
      ctx.skip();
      return;
    }
    vi.stubEnv('APP_ENV', 'local');
    vi.stubEnv('EMAIL_MODE', 'smtp');
    vi.stubEnv('SMTP_HOST', process.env.SMTP_HOST ?? '127.0.0.1');
    vi.stubEnv('SMTP_PORT', process.env.SMTP_PORT ?? '1025');
    resetEmailConfig();
    setTransport(undefined);

    const learner = await createLearner();
    expect(emailConfig().mode).toBe('smtp');
    const subject = `Rappel SPEC-204 ${randomUUID().slice(0, 8)}`;
    const result = await sendEmail(context(), {
      userId: learner.id,
      template: 'reminder',
      props: {
        title: subject,
        body: 'Module 3 · Comptabilité générale, tentative 2.',
        href: '/accueil',
        formationTitle: 'SAP S/4HANA Finance',
      },
      idempotencyKey: `smtp:${learner.id}`,
    });
    expect(result.ok).toBe(true);

    let subjects: string[] = [];
    for (let attempt = 0; attempt < 20 && !subjects.includes(subject); attempt += 1) {
      subjects = await mailpitSubjects();
      if (!subjects.includes(subject)) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    expect(subjects).toContain(subject);
    expect(subject).not.toContain(learner.email);
  });
});
