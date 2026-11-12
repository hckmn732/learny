import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { setClock } from '@learny/core';
import { closeDb, schema, serviceDb } from '@learny/db';
import { createFixedClock } from '@learny/testing';

import {
  MAX_INLINE_DEPTH,
  defineFunction,
  dispatchInline,
  emitAfterCommit,
  executeFunctionInline,
  nightlyOutboxCleanup,
  resetInlineState,
  sddDemoPipeline,
  setInlineRegistry,
  functions,
  type InlineEvent,
} from '../../src';

const { sddDemoRuns, eventOutbox } = schema;

const event = (runId: string, failOnceAt: 'none' | 'step-2'): InlineEvent => ({
  id: `sdd-demo:${runId}`,
  name: 'sdd/demo-requested',
  data: { runId, failOnceAt },
  ts: Date.parse('2026-11-11T12:20:00Z'),
});

const runOf = async (runId: string) =>
  (await serviceDb().select().from(sddDemoRuns).where(eq(sddDemoRuns.runId, runId)))[0];

const created: string[] = [];

beforeAll(() => {
  setClock(createFixedClock('2026-11-11T12:20:00Z'));
});

afterAll(async () => {
  for (const runId of created) {
    await serviceDb().delete(sddDemoRuns).where(eq(sddDemoRuns.runId, runId));
  }
  await closeDb();
});

describe('[SPEC-203] pipeline', () => {
  it('CA-3 — échec simulé de l’étape 2 : trois étapes terminées, attempts = 2, étape 1 exécutée une fois', async () => {
    const runId = randomUUID();
    created.push(runId);

    const result = await executeFunctionInline(sddDemoPipeline, event(runId, 'step-2'));

    expect(result).toMatchObject({ status: 'completed', executions: 2 });
    // Step 1 and step 3 ran once; step 2 ran twice (one failure, one retry).
    expect(result.stepRuns).toEqual({
      'step-1-prepare': 1,
      'step-2-process': 2,
      'step-3-finish': 1,
    });
    const row = await runOf(runId);
    expect(row?.attempts).toBe(2);
    expect(row?.steps.map((step) => step.name)).toEqual([
      'step-1-prepare',
      'step-2-process',
      'step-3-finish',
    ]);
    expect(row?.finishedAt?.toISOString()).toBe('2026-11-11T12:20:00.000Z');
  });

  it('sans échec simulé, l’étape 2 s’exécute une seule fois (attempts = 1)', async () => {
    const runId = randomUUID();
    created.push(runId);

    const result = await executeFunctionInline(sddDemoPipeline, event(runId, 'none'));

    expect(result).toMatchObject({ status: 'completed', executions: 1 });
    expect((await runOf(runId))?.attempts).toBe(1);
  });

  it('ET-4 — chaque étape est idempotente : rejouer le pipeline n’ajoute aucune étape', async () => {
    const runId = randomUUID();
    created.push(runId);
    await executeFunctionInline(sddDemoPipeline, event(runId, 'none'));
    await executeFunctionInline(sddDemoPipeline, event(runId, 'none'));
    const row = await runOf(runId);
    expect(row?.steps).toHaveLength(3);
    expect(new Set(row?.steps.map((step) => step.name)).size).toBe(3);
  });

  it('ET-4 — un échec définitif est rapporté et ne lève pas dans l’émetteur', async () => {
    const runId = randomUUID();
    // The run is created, then its table row is dropped between two steps: step 2 never succeeds.
    const broken = defineFunction(
      { id: 'pipeline-broken-probe', trigger: { event: 'sdd/demo-requested' }, retries: 1 },
      async ({ step }) => {
        await step.run('always-fails', () => Promise.reject(new Error('indisponible')));
      },
    );
    const result = await executeFunctionInline(broken, event(runId, 'none'));
    expect(result).toMatchObject({ status: 'failed', executions: 2 });
    expect(result.error?.message).toContain('indisponible');
  });
});

describe('[SPEC-203] mode en ligne', () => {
  it('CA-6 — l’émission exécute la fonction abonnée dans le processus, effets visibles au retour', async () => {
    vi.stubEnv('JOBS_MODE', 'inline');
    resetInlineState();
    setInlineRegistry(functions);
    try {
      const runId = randomUUID();
      created.push(runId);
      await emitAfterCommit(
        serviceDb(),
        'sdd/demo-requested',
        { runId, failOnceAt: 'step-2' },
        { id: `sdd-demo:${runId}` },
      );

      // Visible as soon as the emitter returns: finished, with its retry (EF-6).
      const row = await runOf(runId);
      expect(row?.attempts).toBe(2);
      expect(row?.finishedAt).not.toBeNull();
      expect(row?.steps).toHaveLength(3);
      const [outbox] = await serviceDb()
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, `sdd-demo:${runId}`));
      expect(outbox?.sentAt).not.toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('CL-3 — un même identifiant ne déclenche qu’une exécution des consommateurs', async () => {
    resetInlineState();
    const runId = randomUUID();
    created.push(runId);
    const sent = event(runId, 'none');
    await dispatchInline([sent]);
    await dispatchInline([sent]);
    expect((await runOf(runId))?.attempts).toBe(1);
  });

  it('ET-3 — la profondeur est limitée : au-delà, erreur inline_depth_exceeded sans boucle infinie', async () => {
    resetInlineState();
    let levels = 0;
    const loop = defineFunction(
      { id: 'inline-depth-probe', trigger: { event: 'cron/nightly' }, retries: 0 },
      async ({ step }) => {
        // The handler is re-entered after each step: count the runs through a step body.
        const level = await step.run('count-level', () => {
          levels += 1;
          return Promise.resolve(levels);
        });
        await step.sendEvent('again', {
          id: `depth-probe:${String(level)}:${randomUUID()}`,
          name: 'cron/nightly',
          data: { runDate: '2026-11-11' },
        });
      },
    );
    setInlineRegistry([loop]);
    try {
      await dispatchInline([
        {
          id: `depth-probe:0:${randomUUID()}`,
          name: 'cron/nightly',
          data: { runDate: '2026-11-11' },
          ts: 0,
        },
      ]);
      expect(levels).toBe(MAX_INLINE_DEPTH);
    } finally {
      setInlineRegistry(functions);
    }
  });

  it('ET-6 — le nettoyage nocturne supprime les lignes envoyées depuis plus de 7 jours', async () => {
    const stale = `cleanup-stale:${randomUUID()}`;
    const recent = `cleanup-recent:${randomUUID()}`;
    const pending = `cleanup-pending:${randomUUID()}`;
    await serviceDb()
      .insert(eventOutbox)
      .values([
        {
          eventId: stale,
          name: 'cron/nightly',
          data: {},
          sentAt: new Date('2026-11-03T12:19:00Z'),
        },
        {
          eventId: recent,
          name: 'cron/nightly',
          data: {},
          sentAt: new Date('2026-11-05T12:20:00Z'),
        },
        { eventId: pending, name: 'cron/nightly', data: {}, sentAt: null },
      ]);

    const result = await executeFunctionInline(nightlyOutboxCleanup, {
      id: `nightly:2026-11-11:${randomUUID()}`,
      name: 'cron/nightly',
      data: { runDate: '2026-11-11' },
      ts: 0,
    });
    expect(result.status).toBe('completed');

    const remaining = async (id: string) =>
      (await serviceDb().select().from(eventOutbox).where(eq(eventOutbox.eventId, id))).length;
    expect(await remaining(stale)).toBe(0);
    expect(await remaining(recent)).toBe(1);
    expect(await remaining(pending)).toBe(1);
    await serviceDb().delete(eventOutbox).where(eq(eventOutbox.eventId, recent));
    await serviceDb().delete(eventOutbox).where(eq(eventOutbox.eventId, pending));
  });
});
