// Demonstration data of SPEC-711: the ten keys of the registry, one isolated fake definition and
// the real engine applied to a fixture account that is removed at the end of the request
// (ADR-0049). `serviceDb` is used only to create and clean the fixture; every action of the
// learner goes through `createServiceContext` and therefore through RLS. The clock is fixed at
// 2026-11-11T12:20:00Z (ADR-0047), so the captures stay reproducible.
import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import {
  acceptAutomationAction,
  createAutomationRegistry,
  declineAutomationAction,
  defineAutomation,
  listMyAutomationActions,
  markConsumed,
  runAutomation,
  startOfUserWeek,
  undoAutomationAction,
  type AutomationRegistry,
} from '@learny/automations';
import { EVENT_AUTOMATION_KEYS } from '@learny/contracts';
import { ok, type Clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createServiceContext } from '@learny/services';

const AT = '2026-11-11T12:20:00.000Z';
const PREFIX = 'sdd-711-demo-';
const TIME_ZONE = 'Europe/Paris';
const CLOCK: Clock = { now: () => new Date(AT) };

export interface Spec711KeyRow {
  key: string;
  triggers: string;
  params: string;
  explanation: string;
  registered: boolean;
}

export interface Spec711Step {
  label: string;
  result: string;
  code: string | null;
}

export interface Spec711JournalRow {
  createdAt: string;
  automation: string;
  status: string;
  summary: string;
  canUndo: boolean;
}

export interface Spec711Data {
  keys: Spec711KeyRow[];
  steps: Spec711Step[];
  effectCount: number;
  refusalTitle: string;
  refusalMessage: string;
  journal: Spec711JournalRow[];
  weekCount: number;
  weekStart: string;
}

/** The fake definition of the demonstration: isolated from the product data (SPEC-711 §10). */
function createDemoRegistry(effect: { applyCalls: number }): AutomationRegistry {
  const registry = createAutomationRegistry();
  registry.register(
    defineAutomation({
      key: 'reprise',
      triggers: [{ type: 'event', name: 'formation/resumed' }],
      params: z.object({}).default({}),
      run: (ctx) =>
        Promise.resolve([
          {
            kind: 'reprise_demo',
            formationId: null,
            requiresConsent: true,
            payload: { minutes: 15 },
            undoPayload: { restaure: 'aucune séance' },
            dedupeKey: `sdd711-reprise:${ctx.userId}`,
            notification: { type: 'relaunch', href: '/aujourdhui' },
          },
        ]),
      explain: (_action, tone) =>
        tone === 'tu'
          ? 'Séance de reprise de 15 min proposée pour reprendre en douceur'
          : 'Séance de reprise de 15 min proposée pour reprendre en douceur',
      apply: (_ctx, action) => {
        effect.applyCalls += 1;
        return Promise.resolve(ok({ payload: { ...action.payload, accord: 'gardé' } }));
      },
      undo: () => Promise.resolve(ok(null)),
    }),
  );
  return registry;
}

function engineContext() {
  return {
    requestId: `sdd-711-${randomUUID().slice(0, 8)}`,
    sdb: serviceDb(),
    clock: CLOCK,
    logger: createLogger({ level: 'error' }),
  };
}

function userContext(userId: string) {
  return createServiceContext({
    userId,
    requestId: `sdd-711-${randomUUID().slice(0, 8)}`,
    clock: CLOCK,
  });
}

interface Fixture {
  userId: string;
}

async function createFixture(email: string): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, firstName: 'Alex', timezone: TIME_ZONE });
    return { userId: user.id };
  });
}

function refusal(code: string, detail: string): { title: string; message: string } {
  return { title: code, message: detail };
}

/** Full demonstration; the isolated accounts are deleted whatever happens. */
export async function loadSpec711Demo(): Promise<Spec711Data> {
  const emailA = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  const emailB = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  let a: string | null = null;
  let b: string | null = null;
  try {
    const fixtureA = await createFixture(emailA);
    a = fixtureA.userId;
    const fixtureB = await createFixture(emailB);
    b = fixtureB.userId;
    const effect = { applyCalls: 0 };
    const registry = createDemoRegistry(effect);
    const engine = engineContext();
    const ctxA = userContext(fixtureA.userId);
    const ctxB = userContext(fixtureB.userId);
    const steps: Spec711Step[] = [];

    // EF-2 — one trigger, one action in `pending_consent`, explained in one line.
    const run1 = await runAutomation(
      engine,
      { key: 'reprise', userId: fixtureA.userId, trigger: { type: 'direct' } },
      { registry },
    );
    if (!run1.ok) throw run1.error;
    const actionId = run1.value.actionIds[0];
    if (actionId === undefined) throw new Error('aucune action proposée');
    steps.push({ label: 'proposed', result: 'created', code: null });

    // EF-4, CA-2 — the same trigger replayed finds the same dedupe key and creates nothing.
    const run2 = await runAutomation(
      engine,
      { key: 'reprise', userId: fixtureA.userId, trigger: { type: 'direct' } },
      { registry },
    );
    if (!run2.ok) throw run2.error;
    steps.push({
      label: 'duplicate',
      result: run2.value.created === 0 ? 'duplicateIgnored' : 'created',
      code: null,
    });

    // EF-2 — the learner accepts; the effect is applied once, with the free `choice` field.
    const accept1 = await acceptAutomationAction(
      ctxA,
      { actionId, choice: { creneau: '2026-11-12T09:00:00.000Z' } },
      { registry },
    );
    if (!accept1.ok) throw accept1.error;
    steps.push({ label: 'accept', result: 'appliedOnce', code: null });

    // CA-2 — a concurrent acceptance of the same action applies no second effect.
    const accept2 = await acceptAutomationAction(ctxA, { actionId }, { registry });
    if (!accept2.ok) throw accept2.error;
    steps.push({
      label: 'concurrent',
      result: effect.applyCalls === 1 ? 'noSecondEffect' : 'appliedOnce',
      code: null,
    });

    // BR-AUT-11 — the effect was used: the action is consumed and can no longer be undone.
    await markConsumed(serviceDb(), { actionId, userId: fixtureA.userId });
    steps.push({ label: 'consumed', result: 'consumed', code: null });
    const undo = await undoAutomationAction(ctxA, { actionId }, { registry });
    const refusalUndo = undo.ok ? null : refusal(undo.error.code, undo.error.detail);
    steps.push({
      label: 'undo',
      result: undo.ok ? 'appliedOnce' : 'undoRefused',
      code: undo.ok ? null : undo.error.code,
    });

    // CL-1 — another learner's identifier answers 404 without revealing any existence.
    const foreign = await acceptAutomationAction(ctxB, { actionId }, { registry });
    const refusalForeign = foreign.ok ? null : refusal(foreign.error.code, foreign.error.detail);
    steps.push({
      label: 'foreign',
      result: foreign.ok ? 'appliedOnce' : 'foreignRefused',
      code: foreign.ok ? null : foreign.error.code,
    });

    // EF-3, BR-AUT-12 — a second proposal, declined, feeds the weekly journal.
    const run3 = await runAutomation(
      engine,
      {
        key: 'bilan',
        userId: fixtureA.userId,
        trigger: { type: 'direct' },
      },
      { registry: createDemoRegistryWithKey(`sdd711-bilan:${fixtureA.userId}`, effect) },
    );
    if (!run3.ok) throw run3.error;
    const secondActionId = run3.value.actionIds[0];
    if (secondActionId === undefined) throw new Error('aucune seconde action proposée');
    const decline = await declineAutomationAction(ctxA, { actionId: secondActionId }, { registry });
    if (!decline.ok) throw decline.error;

    const journal = await listMyAutomationActions(ctxA, { limit: 5 });
    if (!journal.ok) throw journal.error;

    return {
      keys: EVENT_AUTOMATION_KEYS.map((key) => ({
        key,
        triggers: key === 'reprise' ? 'événement formation/resumed' : 'livré par SPEC-712 à 721',
        params: key === 'reprise' ? 'aucun paramètre (démo)' : 'livré par SPEC-712 à 721',
        explanation:
          key === 'reprise'
            ? 'Séance de reprise de 15 min proposée pour reprendre en douceur'
            : '—',
        registered: registry.keys().includes(key),
      })),
      steps,
      effectCount: effect.applyCalls,
      refusalTitle: refusalUndo?.title ?? refusalForeign?.title ?? '',
      refusalMessage: refusalUndo?.message ?? refusalForeign?.message ?? '',
      journal: journal.value.items.map((item) => ({
        createdAt: item.createdAt,
        automation: item.automation,
        status: item.status,
        summary: item.summary,
        canUndo: item.status === 'applied' && item.undoPayload !== null,
      })),
      weekCount: journal.value.weekCount,
      weekStart: startOfUserWeek(AT, TIME_ZONE).toISOString(),
    };
  } finally {
    for (const id of [a, b]) {
      if (id === null) continue;
      await serviceDb().execute(sql`delete from public.groups where owner_id = ${id}::uuid`);
      await serviceDb().execute(sql`delete from auth.users where id = ${id}::uuid`);
    }
  }
}

/** Same fake definition with another dedupe key, so the journal shows a declined row too. */
function createDemoRegistryWithKey(
  dedupeKey: string,
  effect: { applyCalls: number },
): AutomationRegistry {
  const registry = createAutomationRegistry();
  registry.register(
    defineAutomation({
      key: 'bilan',
      triggers: [{ type: 'nightly' }],
      params: z.object({}).default({}),
      run: () =>
        Promise.resolve([
          {
            kind: 'bilan_demo',
            formationId: null,
            requiresConsent: true,
            payload: { minutes: 10 },
            undoPayload: { restaure: 'aucun bilan' },
            dedupeKey,
            notification: { type: 'relaunch', href: '/aujourdhui' },
          },
        ]),
      explain: () => 'Bilan de la semaine proposé pour faire le point en 10 minutes',
      apply: (_ctx, action) => {
        effect.applyCalls += 1;
        return Promise.resolve(ok({ payload: action.payload }));
      },
      undo: () => Promise.resolve(ok(null)),
    }),
  );
  return registry;
}
