// Integration tests of the automation engine (SPEC-711 §12, CA-1 to CA-3, CL-1 to CL-5).
//
// Real Postgres: the partial unique index `automation_actions_dedupe_uq`, the RLS client of the
// learner, the row locks of the decisions and the transactional outbox. The clock is frozen at
// 2026-11-11T12:20:00Z (ADR-0047) and only the effect counters are in memory. The definitions are
// local to this file: SPEC-712 to SPEC-721 register the product ones.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { EVENT_AUTOMATION_KEYS } from '@learny/contracts';
import { ok, type Clock, type Result } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

// `@learny/automations` depends on `@learny/services`; importing its source directly keeps the
// dependency direction acyclic while the test still lives in the services suite (SPEC-711 §9).
import {
  acceptAutomationAction,
  automationRegistry,
  createAutomationRegistry,
  declineAutomationAction,
  defineAutomation,
  expirePendingActions,
  listMyAutomationActions,
  listMyAutomations,
  markConsumed,
  runAutomation,
  undoAutomationAction,
  updateMyAutomationSetting,
  type AutomationEngineContext,
  type AutomationRegistry,
} from '../../../automations/src/moteur-d-automatismes';
import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-711-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const TIME_ZONE = 'Europe/Paris';

const REPRISE_PARAMS = z.object({
  minutes: z.number().int().min(5).max(60).default(15),
});

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Counters {
  applied: number;
  undone: number;
}

interface User {
  userId: string;
  email: string;
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) =>
      (
        await createTestUser(tx, {
          email,
          firstName: 'Alex',
          timezone: TIME_ZONE,
        })
      ).id,
  );
  return { userId, email };
}

function context(user: User, clock: Clock): ServiceContext {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock,
    logger: createLogger({ level: 'error' }),
  });
}

function engine(clock: Clock): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

interface RegistryOptions {
  expiresAt?: string;
  dedupeSuffix?: string;
}

/**
 * The fake definition of the tests. `run` is side-effect free; the counters prove how many times
 * the effect was applied or undone. `minutes` feeds the kind and the dedupe key so a test can
 * propose several distinct actions for the same learner.
 */
function makeRegistry(counters: Counters, options: RegistryOptions = {}): AutomationRegistry {
  const registry = createAutomationRegistry();
  registry.register(
    defineAutomation({
      key: 'reprise',
      triggers: [{ type: 'event', name: 'formation/resumed' }],
      params: REPRISE_PARAMS,
      run: (ctx) => {
        const minutes = ctx.params.minutes;
        return Promise.resolve([
          {
            kind: `reprise_${String(minutes)}`,
            formationId: null,
            requiresConsent: true,
            payload: { minutes },
            undoPayload: { restaure: 'aucune séance' },
            dedupeKey: `reprise:${ctx.userId}:${String(minutes)}${options.dedupeSuffix ?? ''}`,
            ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
            notification: { type: 'relaunch' as const, href: '/aujourdhui' },
          },
        ]);
      },
      explain: (_action, tone) =>
        tone === 'tu'
          ? 'Séance de reprise proposée pour reprendre en douceur'
          : 'Une séance de reprise vous est proposée pour reprendre en douceur',
      apply: (_ctx, action) => {
        counters.applied += 1;
        return Promise.resolve(ok({ payload: { ...action.payload, accord: 'gardé' } }));
      },
      undo: () => {
        counters.undone += 1;
        return Promise.resolve(ok(null));
      },
    }),
  );
  return registry;
}

/** The `pause` key is never suspended by a pause; it applies without consent. */
function registryWithPause(counters: Counters): AutomationRegistry {
  const registry = makeRegistry(counters);
  registry.register(
    defineAutomation({
      key: 'pause',
      triggers: [{ type: 'direct' }],
      params: z.object({}).default({}),
      run: (ctx) =>
        Promise.resolve([
          {
            kind: 'pause_retour',
            formationId: null,
            requiresConsent: false,
            payload: {},
            dedupeKey: `pause:${ctx.userId}`,
          },
        ]),
      explain: () => 'Pause enregistrée, votre reprise est préparée',
    }),
  );
  return registry;
}

async function countActions(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(
    sql`select count(*)::int as n from public.automation_actions where user_id = ${userId}::uuid`,
  );
  return rows[0]?.n ?? 0;
}

async function countEvents(eventId: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(
    sql`select count(*)::int as n from public.event_outbox where event_id = ${eventId}`,
  );
  return rows[0]?.n ?? 0;
}

async function actionStatus(userId: string, actionId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.automation_actions
        where id = ${actionId}::uuid and user_id = ${userId}::uuid`,
  );
  return rows[0]?.status;
}

beforeAll(() => {
  // The product registry is where `updateMyAutomationSetting` validates `params`; registering the
  // same schema here keeps the settings service testable until SPEC-712 registers the definition.
  if (automationRegistry.get('reprise') === undefined) {
    automationRegistry.register(
      defineAutomation({
        key: 'reprise',
        triggers: [{ type: 'event', name: 'formation/resumed' }],
        params: REPRISE_PARAMS,
        run: () => Promise.resolve([]),
        explain: () => 'Réglages de la reprise après décrochage',
      }),
    );
  }
});

afterEach(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-711] service et API', () => {
  it('CA-1, CA-2 — une proposition, une seconde livraison, une acceptation unique et une annulation refusée après consommation', async () => {
    const clock = new TestClock();
    const counters: Counters = { applied: 0, undone: 0 };
    const registry = makeRegistry(counters);
    const alex = await createUser('alex');
    const other = await createUser('other');
    const ctx = context(alex, clock);

    const first = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    expect(first.created).toBe(1);
    expect(first.skipped).toBeNull();
    const actionId = first.actionIds[0];
    if (actionId === undefined) throw new Error('aucune action proposée');
    expect(await actionStatus(alex.userId, actionId)).toBe('pending_consent');
    expect(await countEvents(`automation-action:${actionId}`)).toBe(1);

    // EF-4, CA-2 — le même déclencheur rejoué ne crée pas une seconde action.
    const replay = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    expect(replay.created).toBe(0);
    expect(replay.duplicateIds).toEqual([actionId]);
    expect(await countActions(alex.userId)).toBe(1);

    // EF-2 — l'apprenant accepte ; l'effet reçoit le `choice` libre et s'applique une seule fois.
    const accepted = unwrap(
      await acceptAutomationAction(
        ctx,
        { actionId, choice: { creneau: '2026-11-12T09:00:00.000Z' } },
        { registry },
      ),
    );
    expect(accepted.status).toBe('applied');
    expect(counters.applied).toBe(1);
    expect(await countEvents(`automation-action-applied:${actionId}`)).toBe(1);

    // CA-2 — une seconde acceptation du même identifiant est un rejeu idempotent.
    const again = unwrap(await acceptAutomationAction(ctx, { actionId }, { registry }));
    expect(again.status).toBe('applied');
    expect(counters.applied).toBe(1);
    expect(await countEvents(`automation-action-applied:${actionId}`)).toBe(1);

    // BR-AUT-11 — l'effet a été utilisé : l'action est consommée et ne peut plus être annulée.
    await markConsumed(serviceDb(), { actionId, userId: alex.userId });
    expect(await actionStatus(alex.userId, actionId)).toBe('consumed');
    const undo = await undoAutomationAction(ctx, { actionId }, { registry });
    expect(undo.ok).toBe(false);
    if (undo.ok) throw new Error('une annulation était refusée');
    expect(undo.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
    expect(counters.undone).toBe(0);
    expect(await actionStatus(alex.userId, actionId)).toBe('consumed');

    // CL-1 — un autre apprenant obtient 404 sans révéler l'existence de l'action.
    const foreign = await acceptAutomationAction(context(other, clock), { actionId }, { registry });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) throw new Error('une acceptation étrangère était refusée');
    expect(foreign.error.code).toBe('NOT_FOUND');
    expect(counters.applied).toBe(1);

    // BR-AUT-12 — le journal de A compte une action, celui de B reste vide.
    const journal = unwrap(await listMyAutomationActions(ctx, { limit: 5 }));
    expect(journal.items).toHaveLength(1);
    expect(journal.weekCount).toBe(1);
    expect(journal.items[0]?.summary).toBe(
      'Une séance de reprise vous est proposée pour reprendre en douceur',
    );
    const otherJournal = unwrap(await listMyAutomationActions(context(other, clock), { limit: 5 }));
    expect(otherJournal.items).toHaveLength(0);
    expect(otherJournal.weekCount).toBe(0);
  });

  it('CA-2 — deux acceptations concurrentes n’appliquent l’effet qu’une seule fois', async () => {
    const clock = new TestClock();
    const counters: Counters = { applied: 0, undone: 0 };
    const registry = makeRegistry(counters);
    const alex = await createUser('concurrent');
    const engineCtx = engine(clock);

    const run = unwrap(
      await runAutomation(
        engineCtx,
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    const actionId = run.actionIds[0];
    if (actionId === undefined) throw new Error('aucune action proposée');

    // Deux contextes distincts : deux connexions RLS concurrentes, comme deux requêtes HTTP.
    const [first, second] = await Promise.all([
      acceptAutomationAction(context(alex, clock), { actionId }, { registry }),
      acceptAutomationAction(context(alex, clock), { actionId }, { registry }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(counters.applied).toBe(1);
    expect(await actionStatus(alex.userId, actionId)).toBe('applied');
    expect(await countEvents(`automation-action-applied:${actionId}`)).toBe(1);
  });

  it('CA-2, CL-3, CL-4 — une acceptation sans consentement applique, une action expirée refuse, une annulation appliquée libère l’effet', async () => {
    const clock = new TestClock();
    const counters: Counters = { applied: 0, undone: 0 };
    const alex = await createUser('expired');
    const ctx = context(alex, clock);

    // CL-3 — échéance passée : la proposition naît en attente puis expire au tick horaire.
    const expiringRegistry = makeRegistry(counters, { expiresAt: '2026-11-10T12:20:00.000Z' });
    const expiring = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry: expiringRegistry },
      ),
    );
    const expiredId = expiring.actionIds[0];
    if (expiredId === undefined) throw new Error('aucune action proposée');
    expect(unwrap(await expirePendingActions(engine(clock)))).toBeGreaterThanOrEqual(1);
    expect(await actionStatus(alex.userId, expiredId)).toBe('expired');
    const late = await acceptAutomationAction(
      ctx,
      { actionId: expiredId },
      {
        registry: expiringRegistry,
      },
    );
    expect(late.ok).toBe(false);
    if (late.ok) throw new Error('une acceptation tardive était refusée');
    expect(late.error.code).toBe('CONFLICT');
    expect(counters.applied).toBe(0);

    // CL-4 — une action appliquée peut être annulée tant qu'elle n'est pas consommée.
    const registry = makeRegistry(counters, { dedupeSuffix: ':undo' });
    const applied = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    const appliedId = applied.actionIds[0];
    if (appliedId === undefined) throw new Error('aucune action proposée');
    unwrap(await acceptAutomationAction(ctx, { actionId: appliedId }, { registry }));
    expect(counters.applied).toBe(1);
    const undone = unwrap(await undoAutomationAction(ctx, { actionId: appliedId }, { registry }));
    expect(undone.status).toBe('undone');
    expect(counters.undone).toBe(1);
    expect(await countEvents(`automation-action-undone:${appliedId}`)).toBe(1);
    // Un second refus d'acceptation après annulation renvoie 409, sans second effet.
    const readonly = await acceptAutomationAction(ctx, { actionId: appliedId }, { registry });
    expect(readonly.ok).toBe(false);
    expect(counters.applied).toBe(1);
  });

  it('CL-5 — un automatisme désactivé ou une pause globale ne crée aucune action, la clé pause reste permise', async () => {
    const clock = new TestClock();
    const counters: Counters = { applied: 0, undone: 0 };
    const registry = registryWithPause(counters);
    const alex = await createUser('pause');
    const ctx = context(alex, clock);

    const disabled = unwrap(
      await updateMyAutomationSetting(ctx, { automation: 'reprise', enabled: false }),
    );
    expect(disabled.enabled).toBe(false);
    const skipped = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    expect(skipped.created).toBe(0);
    expect(skipped.skipped).toBe('disabled');
    expect(await countActions(alex.userId)).toBe(0);

    unwrap(await updateMyAutomationSetting(ctx, { automation: 'reprise', enabled: true }));
    await serviceDb().execute(sql`
      insert into public.pauses (user_id, starts_on, ends_on)
      values (${alex.userId}::uuid, '2026-11-09', '2026-11-15')
    `);
    const paused = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    expect(paused.created).toBe(0);
    expect(paused.skipped).toBe('paused');
    const settings = unwrap(await listMyAutomations(ctx));
    expect(settings.paused).toBe(true);
    expect(settings.items).toHaveLength(EVENT_AUTOMATION_KEYS.length);

    // La clé `pause` n'est jamais suspendue par la pause globale.
    const pauseRun = unwrap(
      await runAutomation(
        engine(clock),
        { key: 'pause', userId: alex.userId, trigger: { type: 'direct' } },
        { registry },
      ),
    );
    expect(pauseRun.created).toBe(1);
    expect(pauseRun.skipped).toBeNull();
    expect(await countActions(alex.userId)).toBe(1);
  });

  it('CA-3, EF-3 — les réglages valident le schéma, une entrée invalide n’écrit rien et le journal filtre et pagine', async () => {
    const clock = new TestClock();
    const counters: Counters = { applied: 0, undone: 0 };
    const registry = makeRegistry(counters);
    const alex = await createUser('journal');
    const ctx = context(alex, clock);

    const settings = unwrap(await listMyAutomations(ctx));
    expect(settings.items.map((item) => item.automation)).toEqual([...EVENT_AUTOMATION_KEYS]);
    expect(settings.items.every((item) => item.enabled)).toBe(true);
    expect(settings.paused).toBe(false);

    const updated = unwrap(
      await updateMyAutomationSetting(ctx, { automation: 'reprise', params: { minutes: 30 } }),
    );
    expect(updated.params).toEqual({ minutes: 30 });
    const invalid = await updateMyAutomationSetting(ctx, {
      automation: 'reprise',
      params: { minutes: 2 },
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error('des paramètres invalides étaient refusés');
    expect(invalid.error.code).toBe('VALIDATION_FAILED');
    const noSchema = await updateMyAutomationSetting(ctx, {
      automation: 'pause',
      params: { minutes: 5 },
    });
    expect(noSchema.ok).toBe(false);
    if (noSchema.ok) throw new Error('un schéma absent était refusé');
    expect(noSchema.error.code).toBe('VALIDATION_FAILED');

    // CL-1 — des réglages stockés invalides refusent la proposition sans écrire aucune ligne.
    await serviceDb().execute(sql`
      update public.automation_settings set params = '{"minutes":"x"}'::jsonb
      where user_id = ${alex.userId}::uuid and key = 'reprise'
    `);
    const invalidRun = await runAutomation(
      engine(clock),
      { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
      { registry },
    );
    expect(invalidRun.ok).toBe(false);
    if (invalidRun.ok) throw new Error('des réglages invalides étaient refusés');
    expect(invalidRun.error.code).toBe('VALIDATION_FAILED');
    expect(await countActions(alex.userId)).toBe(0);

    // CA-3 — trois propositions valides, un filtre et une pagination stable par curseur.
    for (const minutes of [10, 20, 30]) {
      unwrap(await updateMyAutomationSetting(ctx, { automation: 'reprise', params: { minutes } }));
      const run = unwrap(
        await runAutomation(
          engine(clock),
          { key: 'reprise', userId: alex.userId, trigger: { type: 'direct' } },
          { registry },
        ),
      );
      expect(run.created).toBe(1);
    }
    const all = unwrap(await listMyAutomationActions(ctx, { limit: 10 }));
    expect(all.items).toHaveLength(3);
    expect(all.weekCount).toBe(3);
    expect(all.nextCursor).toBeNull();

    const filtered = unwrap(
      await listMyAutomationActions(ctx, { automation: 'reprise', kind: 'reprise_20', limit: 10 }),
    );
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.payload.minutes).toBe(20);

    const firstPage = unwrap(await listMyAutomationActions(ctx, { limit: 2 }));
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();
    if (firstPage.nextCursor === null) throw new Error('curseur absent');
    const secondPage = unwrap(
      await listMyAutomationActions(ctx, { limit: 2, cursor: firstPage.nextCursor }),
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    const ids = new Set([...firstPage.items, ...secondPage.items].map((item) => item.id));
    expect(ids.size).toBe(3);

    // CL-1 — une clé sans définition ne produit aucune écriture.
    const unknown = await runAutomation(
      engine(clock),
      { key: 'bilan', userId: alex.userId, trigger: { type: 'direct' } },
      { registry },
    );
    expect(unknown.ok).toBe(false);
    if (unknown.ok) throw new Error('une clé sans définition était refusée');
    expect(unknown.error.code).toBe('NOT_FOUND');
    expect(await countActions(alex.userId)).toBe(3);

    // EF-2 — un refus conserve la ligne dans le journal (BR-AUT-12).
    const pendingId = all.items[0]?.id;
    if (pendingId === undefined) throw new Error('action absente');
    const declined = unwrap(
      await declineAutomationAction(ctx, { actionId: pendingId }, { registry }),
    );
    expect(declined.status).toBe('declined');
    const afterDecline = unwrap(
      await listMyAutomationActions(ctx, { status: 'declined', limit: 5 }),
    );
    expect(afterDecline.items).toHaveLength(1);
  });
});
