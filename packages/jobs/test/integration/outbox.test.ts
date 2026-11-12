import { randomUUID } from 'node:crypto';

import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';
import { closeDb, schema, serviceDb, sql, userDb } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createFixedClock } from '@learny/testing';

import {
  OUTBOX_MAX_ATTEMPTS,
  defaultEventId,
  dispatchPending,
  emitAfterCommit,
  setJobErrorReporter,
  withTransaction,
  type EmitDeps,
  type EventSender,
} from '../../src';

const { eventOutbox } = schema;
const CLOCK = createFixedClock('2026-11-11T12:20:00Z');
const PREFIX = 'outbox-';

interface SentEvent {
  id: string;
  name: string;
  data: Record<string, unknown>;
  ts: number;
}

function recordingSender(failures = 0) {
  const sent: SentEvent[] = [];
  let remaining = failures;
  const sender: EventSender = {
    send: (events) => {
      if (remaining > 0) {
        remaining -= 1;
        return Promise.reject(new Error('Inngest injoignable (simulé)'));
      }
      sent.push(...events);
      return Promise.resolve();
    },
  };
  return { sender, sent, calls: () => sent.length };
}

function deps(sender: EventSender): Partial<EmitDeps> {
  return { sender, clock: CLOCK, mode: 'inngest' };
}

const rowsOf = (eventId: string) =>
  serviceDb().select().from(eventOutbox).where(eq(eventOutbox.eventId, eventId));

let userId: string;
let otherUserId: string;

async function createCommittedUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

beforeAll(async () => {
  userId = await createCommittedUser('a');
  otherUserId = await createCommittedUser('b');
});

beforeEach(() => {
  setJobErrorReporter(undefined);
});

afterAll(async () => {
  const users = [userId, otherUserId];
  await serviceDb().delete(eventOutbox).where(inArray(eventOutbox.userId, users));
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe("[SPEC-203] boîte d'envoi", () => {
  it('CA-1, CL-1 — un événement ajouté dans une transaction annulée n’est jamais écrit ni envoyé', async () => {
    const { sender, sent } = recordingSender();
    const eventId = `test-rollback:${randomUUID()}`;

    await expect(
      withTransaction(
        serviceDb(),
        (_tx, outbox) => {
          outbox.add(
            'gap/cleared',
            { userId, formationId: randomUUID(), notionId: randomUUID() },
            { id: eventId },
          );
          return Promise.reject(new Error('annulation métier'));
        },
        deps(sender),
      ),
    ).rejects.toThrow('annulation métier');

    expect(await rowsOf(eventId)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('CA-1 — validé : envoyé exactement une fois, même si dispatch est rappelé', async () => {
    const { sender, sent } = recordingSender();
    const eventId = `user-onboarding:${randomUUID()}`;
    const data = { userId, completedAt: '2026-11-11T12:20:00.000Z' };

    await withTransaction(
      serviceDb(),
      (_tx, outbox) => {
        outbox.add('user/onboarding-completed', data, { id: eventId });
        return Promise.resolve();
      },
      deps(sender),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ id: eventId, name: 'user/onboarding-completed', data });
    const [row] = await rowsOf(eventId);
    expect(row?.sentAt?.toISOString()).toBe('2026-11-11T12:20:00.000Z');
    expect(row?.userId).toBe(userId);
    expect(row?.attempts).toBe(0);

    // Two more dispatches: the row is sent, nothing is sent again.
    await dispatchPending(500, deps(sender));
    await dispatchPending(500, deps(sender));
    expect(sent).toHaveLength(1);
  });

  it('CA-1 — deux dispatch concurrents d’un même lot n’envoient chaque ligne qu’une fois côté base', async () => {
    const { sender, sent } = recordingSender();
    const eventId = `concurrent:${randomUUID()}`;
    // Pending row written by a first transaction whose dispatch failed (sender down).
    const down = recordingSender(1);
    await emitAfterCommit(
      serviceDb(),
      'resource/ready',
      { userId, resourceId: randomUUID(), chunkCount: 3 },
      { id: eventId },
      deps(down.sender),
    );
    expect((await rowsOf(eventId))[0]?.sentAt).toBeNull();

    await Promise.all([dispatchPending(500, deps(sender)), dispatchPending(500, deps(sender))]);
    // Inngest deduplicates by identifier: the row is sent once or twice, never left pending.
    expect(sent.filter((event) => event.id === eventId).length).toBeGreaterThanOrEqual(1);
    expect((await rowsOf(eventId))[0]?.sentAt).not.toBeNull();
  });

  it('CL-3 — le même identifiant émis deux fois ne crée qu’une ligne et qu’un envoi', async () => {
    const { sender, sent } = recordingSender();
    const eventId = `double-click:${randomUUID()}`;
    const data = { userId, exportId: randomUUID() };

    await emitAfterCommit(
      serviceDb(),
      'account/export-requested',
      data,
      { id: eventId },
      deps(sender),
    );
    await emitAfterCommit(
      serviceDb(),
      'account/export-requested',
      data,
      { id: eventId },
      deps(sender),
    );

    expect(await rowsOf(eventId)).toHaveLength(1);
    expect(sent.filter((event) => event.id === eventId)).toHaveLength(1);
  });

  it('ET-2 — l’identifiant par défaut est stable et dérivé du contenu (SHA-256 tronqué à 32)', async () => {
    const { sender, sent } = recordingSender();
    const data = { userId, exportId: randomUUID() };
    const expected = defaultEventId('account/export-requested', data);
    expect(expected).toMatch(/^account\/export-requested:[0-9a-f]{32}$/);
    // The key order of the data does not change the identifier.
    expect(defaultEventId('account/export-requested', { exportId: data.exportId, userId })).toBe(
      expected,
    );

    await emitAfterCommit(serviceDb(), 'account/export-requested', data, undefined, deps(sender));
    expect(sent.map((event) => event.id)).toEqual([expected]);
  });

  it('EF-2, CL-10 — un schéma violé est refusé à l’émission : erreur, transaction annulée, journal', async () => {
    const { sender, sent } = recordingSender();
    const capture = createLogCapture();
    const logger = createLogger({ destination: capture.destination });
    const marker = `business-write:${randomUUID()}`;

    const attempt = withTransaction(
      serviceDb(),
      async (tx, outbox) => {
        await tx.insert(eventOutbox).values({
          eventId: marker,
          name: 'gap/cleared',
          data: {},
        });
        outbox.add('gap/cleared', { userId: 'pas-un-uuid' } as never);
      },
      { ...deps(sender), logger },
    );

    await expect(attempt).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    expect(await rowsOf(marker)).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(capture.text()).toContain('event_schema_violation');
    // The log names the event, never its data.
    expect(capture.text()).not.toContain('pas-un-uuid');
  });

  it('CA-2, CL-2 — Inngest injoignable : la ligne reste en attente puis part au tick suivant', async () => {
    const down = recordingSender(1);
    const eventId = `outage:${randomUUID()}`;

    await emitAfterCommit(
      serviceDb(),
      'resource/ready',
      { userId, resourceId: randomUUID(), chunkCount: 1 },
      { id: eventId },
      deps(down.sender),
    );
    let [row] = await rowsOf(eventId);
    expect(row).toMatchObject({ attempts: 1, failed: false, sentAt: null });
    expect(row?.lastError).toContain('Inngest injoignable');

    const result = await dispatchPending(500, deps(down.sender));
    expect(result.sent).toBeGreaterThanOrEqual(1);
    [row] = await rowsOf(eventId);
    expect(row?.sentAt).not.toBeNull();
    expect(down.sent.map((event) => event.id)).toContain(eventId);
  });

  it('CA-2 — après 10 échecs, l’entrée est marquée en échec, journalisée et signalée', async () => {
    const reports: unknown[] = [];
    setJobErrorReporter((report) => reports.push(report));
    const capture = createLogCapture();
    const always = recordingSender(1000);
    const eventId = `always-down:${randomUUID()}`;
    const withLog = {
      ...deps(always.sender),
      logger: createLogger({ destination: capture.destination }),
    };

    await emitAfterCommit(
      serviceDb(),
      'resource/ready',
      { userId, resourceId: randomUUID(), chunkCount: 1 },
      { id: eventId },
      withLog,
    );
    for (let attempt = 2; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
      expect((await rowsOf(eventId))[0]).toMatchObject({ attempts: attempt - 1, failed: false });
      await dispatchPending(500, withLog);
    }

    expect((await rowsOf(eventId))[0]).toMatchObject({
      attempts: OUTBOX_MAX_ATTEMPTS,
      failed: true,
      sentAt: null,
    });
    expect(capture.text()).toContain('event_outbox_failed');
    expect(reports).toHaveLength(1);

    // A failed entry is never picked again.
    const callsBefore = always.calls();
    await dispatchPending(500, withLog);
    expect(always.calls()).toBe(callsBefore);
    expect((await rowsOf(eventId))[0]?.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  it('ET-2 — la dernière erreur ne contient ni la charge utile ni une trace de pile', async () => {
    const eventId = `safe-error:${randomUUID()}`;
    const leaking: EventSender = {
      send: () => Promise.reject(new Error(`boom\n    at secret.js:1:1 payload=${userId}`)),
    };
    await emitAfterCommit(
      serviceDb(),
      'resource/ready',
      { userId, resourceId: randomUUID(), chunkCount: 1 },
      { id: eventId },
      deps(leaking),
    );
    const [row] = await rowsOf(eventId);
    expect(row?.lastError).not.toContain('\n');
    expect((row?.lastError ?? '').length).toBeLessThanOrEqual(300);
    // Cleanup of a pending row that would otherwise be sent by a later tick.
    await serviceDb().delete(eventOutbox).where(eq(eventOutbox.eventId, eventId));
  });
});

describe("[SPEC-203] boîte d'envoi : transaction de l'utilisateur", () => {
  it('écrit dans la boîte avec le client de l’utilisateur (enqueue_event, sans droit direct)', async () => {
    const { sender, sent } = recordingSender();
    const eventId = `user-tx:${randomUUID()}`;

    await withTransaction(
      userDb({ userId }),
      (_tx, outbox) => {
        outbox.add(
          'user/onboarding-completed',
          { userId, completedAt: '2026-11-11T12:20:00.000Z' },
          { id: eventId },
        );
        return Promise.resolve();
      },
      deps(sender),
    );
    expect(sent.map((event) => event.id)).toEqual([eventId]);
    expect((await rowsOf(eventId))[0]?.userId).toBe(userId);
  });

  it('attribue à l’acteur un événement sans userId (démonstration SDD)', async () => {
    const { sender } = recordingSender();
    const eventId = `sdd-demo:${randomUUID()}`;
    await emitAfterCommit(
      userDb({ userId }),
      'sdd/demo-requested',
      { runId: randomUUID(), failOnceAt: 'none' },
      { id: eventId },
      deps(sender),
    );
    expect((await rowsOf(eventId))[0]?.userId).toBe(userId);
  });

  it('refuse l’événement d’un autre utilisateur ou un événement cron/*, transaction annulée', async () => {
    const { sender, sent } = recordingSender();
    const forged = `forged:${randomUUID()}`;
    const cron = `forged-cron:${randomUUID()}`;

    await expect(
      emitAfterCommit(
        userDb({ userId }),
        'account/deletion-requested',
        { userId: otherUserId, scheduledFor: '2026-12-11T12:20:00.000Z' },
        { id: forged },
        deps(sender),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(
      emitAfterCommit(
        userDb({ userId }),
        'cron/nightly',
        { runDate: '2026-11-11' },
        { id: cron },
        deps(sender),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });

    expect(await rowsOf(forged)).toHaveLength(0);
    expect(await rowsOf(cron)).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('le rôle utilisateur ne lit ni n’écrit directement la boîte d’envoi', async () => {
    const eventId = `direct:${randomUUID()}`;
    await serviceDb().insert(eventOutbox).values({ eventId, name: 'cron/nightly', data: {} });
    const visible = await userDb({ userId }).run(async (tx) => {
      const rows = await tx.select().from(eventOutbox).where(like(eventOutbox.eventId, 'direct:%'));
      return rows.length;
    });
    expect(visible).toBe(0);
    await expect(
      userDb({ userId }).run((tx) =>
        tx
          .insert(eventOutbox)
          .values({ eventId: `x:${randomUUID()}`, name: 'cron/nightly', data: {} }),
      ),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
    await serviceDb().delete(eventOutbox).where(eq(eventOutbox.eventId, eventId));
  });
});

describe('[SPEC-203] mode en ligne (envoi)', () => {
  it('l’envoi n’appelle pas Inngest quand JOBS_MODE=inline', async () => {
    vi.stubEnv('JOBS_MODE', 'inline');
    try {
      const { sender, sent } = recordingSender();
      const eventId = `inline-nosend:${randomUUID()}`;
      // No function subscribes to this event: the dispatcher runs nothing and the row is sent.
      await emitAfterCommit(
        serviceDb(),
        'gap/cleared',
        { userId, formationId: randomUUID(), notionId: randomUUID() },
        { id: eventId },
        { sender, clock: CLOCK },
      );
      expect(sent).toHaveLength(0);
      expect((await rowsOf(eventId))[0]?.sentAt).not.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
