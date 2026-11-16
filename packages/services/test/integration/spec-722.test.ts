// Integration tests of the home card « Le tuteur a agi pour vous » (SPEC-722 §12, CA-1 to CA-3).
//
// Real Postgres and the RLS client of the learner: the card reads the journal through the very
// functions of SPEC-711 (`listMyAutomationActions`, `accept|decline|undo`) and the decisions keep
// their row locks, their 404 for a foreign owner and their idempotent replay. The clock is frozen
// at 2026-11-11T12:20:00Z (ADR-0047); no test reads the process time.
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { AutomationActionListQuery, AutomationActionParams } from '@learny/contracts';
import { AppError } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createServiceContext, type ServiceContext } from '@learny/services';

import {
  acceptAutomationAction,
  declineAutomationAction,
  listMyAutomationActions,
  undoAutomationAction,
} from '../../../automations/src/moteur-d-automatismes';
import {
  createTutorActivityService,
  type TutorActivityPorts,
} from '../../src/accueil-le-tuteur-a-agi-pour-vous';

const PREFIX = 'sdd-722-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const TIME_ZONE = 'Europe/Paris';

class TestClock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface User {
  userId: string;
  email: string;
}

function context(user: User): ServiceContext {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: AppError }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function ports(): TutorActivityPorts {
  return {
    list: (ctx, query) => listMyAutomationActions(ctx, query),
    accept: (ctx, input) => acceptAutomationAction(ctx, input),
    decline: (ctx, input) => declineAutomationAction(ctx, input),
    undo: (ctx, input) => undoAutomationAction(ctx, input),
  };
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const row = await createTestUser(tx, { email, firstName: 'Alex', timezone: TIME_ZONE });
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done'
      where id = ${row.id}::uuid
    `);
    return { userId: row.id, email: row.email };
  });
}

async function createFormation(user: User): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    insert into public.formations (
      owner_id, title, status, objectives, start_date, end_date, volume_hours
    ) values (
      ${user.userId}::uuid, 'SAP S/4HANA Finance', 'active'::formation_status,
      '{operational}'::formation_objective[], '2026-10-01'::date, '2026-12-11'::date, 30
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('formation non créée');
  return id;
}

interface InsertedAction {
  id: string;
  summary: string;
}

async function insertAction(
  user: User,
  formationId: string,
  input: {
    automation: string;
    kind: string;
    summary: string;
    status: 'pending_consent' | 'applied' | 'consumed';
    requiresConsent?: boolean;
    payload?: Record<string, unknown>;
    createdAt?: string;
  },
): Promise<InsertedAction> {
  const createdAt = input.createdAt ?? '2026-11-11T07:00:00.000Z';
  const rows = await serviceDb().execute<{ id: string; summary: string }>(sql`
    insert into public.automation_actions (
      user_id, formation_id, automation, kind, summary, payload, undo_payload,
      requires_consent, status, decided_at, created_at
    ) values (
      ${user.userId}::uuid, ${formationId}::uuid, ${input.automation}::automation_key,
      ${input.kind}, ${input.summary}, ${JSON.stringify(input.payload ?? {})}::jsonb, null,
      ${input.requiresConsent ?? input.status === 'pending_consent'},
      ${input.status}::automation_status,
      ${input.status === 'pending_consent' ? null : createdAt}::timestamptz,
      ${createdAt}::timestamptz
    )
    returning id::text as id, summary
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('action non créée');
  return row;
}

async function actionStatus(userId: string, actionId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status from public.automation_actions
    where id = ${actionId}::uuid and user_id = ${userId}::uuid
  `);
  return rows[0]?.status;
}

async function countEvents(eventId: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(
    sql`select count(*)::int as n from public.event_outbox where event_id = ${eventId}`,
  );
  return rows[0]?.n ?? 0;
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-722] service et API', () => {
  it('CA-1, CA-2 — la carte lit applied|consumed, accepte une proposition une seule fois et garde le résumé consommé', async () => {
    const alex = await createUser('carte');
    const formationId = await createFormation(alex);
    const pending = await insertAction(alex, formationId, {
      automation: 'reprise',
      kind: 'reprise_proposed',
      summary: 'Je propose de reprendre la séance jeudi à 10:30.',
      status: 'pending_consent',
      payload: {
        proposed: { startsAt: '2026-11-12T09:30:00.000Z' },
        chosenStartsAt: '2026-11-12T09:30:00.000Z',
      },
      createdAt: '2026-11-11T08:05:00.000Z',
    });
    const applied = await insertAction(alex, formationId, {
      automation: 'remediation',
      kind: 'remediation_ready',
      summary: 'Marge de remédiation réservée mercredi de 15:00 à 16:00.',
      status: 'applied',
      createdAt: '2026-11-11T07:00:00.000Z',
    });
    const consumed = await insertAction(alex, formationId, {
      automation: 'micro_seance',
      kind: 'micro_session_done',
      summary: 'Micro-séance de 5 min faite : votre série est conservée.',
      status: 'consumed',
      createdAt: '2026-11-11T07:30:00.000Z',
    });
    const ctx = context(alex);
    const service = createTutorActivityService(ports());

    // EF-1 — le bandeau lit bien les actions en attente ; la carte les exclut.
    const before = unwrap(await service.read(ctx, { timeZone: TIME_ZONE }));
    expect(before.items.map((item) => item.id)).toEqual([consumed.id, applied.id]);
    expect(before.items.find((item) => item.id === consumed.id)?.canUndo).toBe(false);
    expect(before.proposals).toHaveLength(0);
    const banner = unwrap(await listMyAutomationActions(ctx, { status: 'pending_consent' }));
    expect(banner.items.map((item) => item.id)).toEqual([pending.id]);

    // CA-1 — Accepter applique l'action une seule fois, la carte se met à jour.
    const accepted = unwrap(await service.accept(ctx, { actionId: pending.id }));
    expect(accepted.status).toBe('applied');
    const replay = unwrap(await service.accept(ctx, { actionId: pending.id }));
    expect(replay.status).toBe('applied');
    expect(await actionStatus(alex.userId, pending.id)).toBe('applied');
    expect(await countEvents(`automation-action-applied:${pending.id}`)).toBe(1);
    const after = unwrap(await service.read(ctx, { timeZone: TIME_ZONE }));
    expect(after.items[0]?.id).toBe(pending.id);
    expect(after.items[0]?.summary).toBe('Je propose de reprendre la séance jeudi à 10:30.');
    expect(after.items[0]?.href).toBe('/agenda?vue=semaine&date=2026-11-12');
    expect((await listMyAutomationActions(ctx, { status: 'pending_consent' })).ok).toBe(true);

    // CA-2 — une action consommée garde son résumé et refuse l'annulation.
    const undone = await service.undo(ctx, { actionId: consumed.id });
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
    const stillThere = unwrap(await service.read(ctx, { timeZone: TIME_ZONE }));
    const consumedItem = stillThere.items.find((item) => item.id === consumed.id);
    expect(consumedItem?.summary).toBe('Micro-séance de 5 min faite : votre série est conservée.');
    expect(consumedItem?.canUndo).toBe(false);
  });

  it('CA-3 — 404 pour un autre propriétaire, 409 sur un état caduc, double envoi sans doublon', async () => {
    const alex = await createUser('proprietaire');
    const other = await createUser('autre');
    const formationId = await createFormation(alex);
    const pending = await insertAction(alex, formationId, {
      automation: 'questions_cartes',
      kind: 'card_proposed',
      summary: 'Votre question peut devenir une carte de rappel.',
      status: 'pending_consent',
    });
    const consumed = await insertAction(alex, formationId, {
      automation: 'micro_seance',
      kind: 'micro_session_done',
      summary: 'Micro-séance faite.',
      status: 'consumed',
    });
    const alexCtx = context(alex);
    const otherCtx = context(other);
    const service = createTutorActivityService(ports());

    // CA-3 — un autre apprenant ne voit ni n'accepte l'action du premier.
    const foreignList = unwrap(await service.read(otherCtx, { timeZone: TIME_ZONE }));
    expect(foreignList.items).toHaveLength(0);
    expect(foreignList.proposals).toHaveLength(0);
    const foreign = await service.accept(otherCtx, { actionId: pending.id });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');
    expect(await actionStatus(alex.userId, pending.id)).toBe('pending_consent');

    // CA-3 — deux demandes identiques n'écrivent qu'un effet et qu'un événement.
    const first = unwrap(await service.accept(alexCtx, { actionId: pending.id }));
    const second = unwrap(await service.accept(alexCtx, { actionId: pending.id }));
    expect(first.status).toBe('applied');
    expect(second.status).toBe('applied');
    expect(await countEvents(`automation-action-applied:${pending.id}`)).toBe(1);

    // CL-2 — une version devenue caduque renvoie 409 et ne change rien.
    const stale = await service.decline(alexCtx, { actionId: pending.id });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('CONFLICT');
    const staleUndo = await service.undo(alexCtx, { actionId: consumed.id });
    expect(staleUndo.ok).toBe(false);
    if (!staleUndo.ok) expect(staleUndo.error.code).toBe('AUTOMATION_ACTION_CONSUMED');

    // CL-1 — une entrée hors schéma est refusée avant toute écriture (400 à la route).
    expect(AutomationActionListQuery.safeParse({ status: 'bogus' }).success).toBe(false);
    expect(AutomationActionParams.safeParse({ id: 'pas-un-uuid' }).success).toBe(false);
  });
});
