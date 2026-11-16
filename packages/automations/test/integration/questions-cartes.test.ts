// Integration tests of the sixth automation (SPEC-717 §12, CA-1 to CA-3, CL-1 to CL-5).
// Real Postgres: the engine of SPEC-711, the learner RLS client, the tutor conversation of
// SPEC-610, the brick schema of SPEC-501 and the global quiz of SPEC-701. The clock is injected
// and the AI stays in deterministic mock mode (ADR-0047, ADR-0048).
import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createServiceContext, type ServiceContext } from '@learny/services';

import {
  acceptAutomationAction,
  declineAutomationAction,
  markConsumed,
  runAutomation,
  undoAutomationAction,
  type AutomationEngineContext,
} from '../../src';

const PREFIX = 'sdd-717-';
const PARIS = 'Europe/Paris';
const NOW = '2026-11-11T12:20:00.000Z';

class TestClock {
  private at: Date;

  constructor(at: string) {
    this.at = new Date(at);
  }

  now(): Date {
    return new Date(this.at);
  }
}

interface User {
  id: string;
  email: string;
}

interface Fixture {
  a: User;
  b: User;
  formationId: string;
  moduleId: string;
  courseId: string;
  chapterId: string;
  notionId: string;
  notionLabel: string;
  clock: TestClock;
}

function engine(clock: TestClock): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

function context(user: User, clock: TestClock): ServiceContext {
  return createServiceContext({
    userId: user.id,
    email: user.email,
    requestId: randomUUID(),
    clock,
    logger: createLogger({ level: 'error' }),
  });
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const row = await createTestUser(tx, { email, firstName: 'Alex', timezone: PARIS });
    await tx.execute(sql`
      update public.profiles
      set created_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_step = 'done'
      where id = ${row.id}::uuid
    `);
    return { id: row.id, email: row.email };
  });
}

async function setMode(user: User, mode: 'confirm' | 'auto'): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (${user.id}::uuid, 'questions_cartes', true, ${JSON.stringify({ mode })}::jsonb)
    on conflict (user_id, key) do update
      set enabled = excluded.enabled, params = excluded.params
  `);
}

async function conversation(
  fixture: Fixture,
  user: User,
  input: {
    question: string;
    answer: string | null;
    title?: string;
  },
): Promise<{ conversationId: string; questionId: string; answerId: string | null }> {
  const conversationId = randomUUID();
  const questionId = randomUUID();
  const answerId = input.answer === null ? null : randomUUID();
  await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      insert into public.tutor_conversations (id, user_id, course_id, title, created_at)
      values (
        ${conversationId}::uuid,
        ${user.id}::uuid,
        ${fixture.courseId}::uuid,
        ${input.title ?? 'Discussion · compatibilité'},
        '2026-11-09T11:00:00Z'::timestamptz
      )
    `);
    await tx.execute(sql`
      insert into public.tutor_messages (
        id, conversation_id, user_id, role, content, context, created_at
      ) values (
        ${questionId}::uuid,
        ${conversationId}::uuid,
        ${user.id}::uuid,
        'learner',
        ${input.question},
        ${JSON.stringify({ chapter: 1 })}::jsonb,
        '2026-11-09T11:10:00Z'::timestamptz
      )
    `);
    if (answerId !== null) {
      await tx.execute(sql`
        insert into public.tutor_messages (
          id, conversation_id, user_id, role, content, context, created_at
        ) values (
          ${answerId}::uuid,
          ${conversationId}::uuid,
          ${user.id}::uuid,
          'tutor',
          ${input.answer ?? ''},
          ${JSON.stringify({ chapter: 1, notionId: fixture.notionId })}::jsonb,
          '2026-11-09T11:11:00Z'::timestamptz
        )
      `);
    }
  });
  return { conversationId, questionId, answerId };
}

function eventOf(
  fixture: Fixture,
  user: User,
  ids: { conversationId: string; questionId: string },
  text: string,
  notionIds: string[] = [fixture.notionId],
): Record<string, unknown> {
  return {
    userId: user.id,
    formationId: fixture.formationId,
    courseId: fixture.courseId,
    conversationId: ids.conversationId,
    messageId: ids.questionId,
    chapterId: fixture.chapterId,
    notionIds,
    text,
  };
}

async function run(
  fixture: Fixture,
  user: User,
  ids: { conversationId: string; questionId: string },
  text: string,
  notionIds?: string[],
) {
  const result = await runAutomation(engine(fixture.clock), {
    key: 'questions_cartes',
    userId: user.id,
    trigger: {
      type: 'event',
      name: 'tutor/question-asked',
      data: eventOf(fixture, user, ids, text, notionIds),
    },
  });
  if (!result.ok) throw result.error;
  return result.value;
}

async function actionRows(
  user: User,
): Promise<{ id: string; status: string; payload: Record<string, unknown> }[]> {
  return serviceDb().execute<{ id: string; status: string; payload: Record<string, unknown> }>(sql`
    select id::text as id, status::text as status, payload
    from public.automation_actions
    where user_id = ${user.id}::uuid and automation = 'questions_cartes'
    order by created_at asc, id asc
  `);
}

async function brickRows(
  user: User,
): Promise<{ id: string; status: string; type: string; notion_ids: string[]; payload: unknown }[]> {
  return serviceDb().execute<{
    id: string;
    status: string;
    type: string;
    notion_ids: string[];
    payload: unknown;
  }>(sql`
    select b.id::text as id, b.status::text as status, b.type::text as type,
           b.notion_ids::text[] as notion_ids, v.payload
    from public.bricks b
    join public.brick_versions v on v.brick_id = b.id and v.version = b.current_version
    where b.owner_id = ${user.id}::uuid
    order by b.created_at asc, b.id asc
  `);
}

async function outboxCount(eventId: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(sql`
    select count(*)::int as n from public.event_outbox where event_id = ${eventId}
  `);
  return rows[0]?.n ?? 0;
}

async function cleanup(user: User): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.bricks
    where owner_id = ${user.id}::uuid
      and id in (
        select (payload ->> 'brickId')::uuid
        from public.automation_actions
        where user_id = ${user.id}::uuid
          and automation = 'questions_cartes'
          and payload ->> 'brickId' is not null
      )
  `);
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${user.id}::uuid and automation = 'questions_cartes'
  `);
  await serviceDb().execute(sql`
    delete from public.tutor_messages where user_id = ${user.id}::uuid
  `);
  await serviceDb().execute(sql`
    delete from public.tutor_conversations where user_id = ${user.id}::uuid
  `);
}

describe('[SPEC-717] service et API — question devenue carte', () => {
  let fixture: Fixture;

  beforeEach(async () => {
    const a = await createUser('a');
    const b = await createUser('b');
    const clock = new TestClock(NOW);
    const programme = await serviceDb().transaction(async (tx) => {
      const created = await createTestProgramme(tx, a.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 2,
        title: 'SAP S/4HANA Finance',
      });
      const course = await createTestCourse(tx, {
        ownerId: a.id,
        moduleId: created.moduleIds[0] ?? '',
      });
      return { ...created, courseId: course.courseId };
    });
    const notionId = programme.notionIds[0] ?? '';
    const labelRows = await serviceDb().execute<{ label: string }>(sql`
      select label from public.notions where id = ${notionId}::uuid
    `);
    fixture = {
      a,
      b,
      formationId: programme.formationId,
      moduleId: programme.moduleIds[0] ?? '',
      courseId: programme.courseId,
      chapterId: programme.chapterIds[0] ?? '',
      notionId,
      notionLabel: labelRows[0]?.label ?? 'Notion',
      clock,
    };
    await cleanup(a);
    await cleanup(b);
    await setMode(a, 'confirm');
  });

  it('CA-1 — le réglage par défaut attend l’accord ; l’acceptation crée une seule carte', async () => {
    const ids = await conversation(fixture, fixture.a, {
      question: 'Pourquoi la clé est-elle portée par le poste ?',
      answer: 'La clé de comptabilisation dépend du compte général mouvementé par le poste.',
    });
    const first = await run(
      fixture,
      fixture.a,
      ids,
      'Pourquoi la clé est-elle portée par le poste ?',
    );
    expect(first.created).toBe(1);
    const pending = await actionRows(fixture.a);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.status).toBe('pending_consent');
    expect(pending[0]?.payload.brickId).toBeNull();
    expect(await brickRows(fixture.a)).toHaveLength(0);

    const actionId = pending[0]?.id ?? '';
    const accepted = await acceptAutomationAction(context(fixture.a, fixture.clock), { actionId });
    if (!accepted.ok) throw accepted.error;
    expect(accepted.value.status).toBe('applied');

    const bricks = await brickRows(fixture.a);
    expect(bricks).toHaveLength(1);
    expect(bricks[0]?.type).toBe('recall_card');
    expect(bricks[0]?.status).toBe('active');
    expect(bricks[0]?.notion_ids).toEqual([fixture.notionId]);
    const payload = bricks[0]?.payload as { front: string; back: string };
    expect(payload.front).toBe('Pourquoi la clé est-elle portée par le poste ?');
    expect(payload.back).toContain('compte général');
    expect(await outboxCount(`automation-action-applied:${actionId}`)).toBe(1);

    const replay = await acceptAutomationAction(context(fixture.a, fixture.clock), { actionId });
    if (!replay.ok) throw replay.error;
    expect(await brickRows(fixture.a)).toHaveLength(1);
    expect(await outboxCount(`automation-action-applied:${actionId}`)).toBe(1);
  });

  it('CA-2 — en mode automatique la carte entre au quiz et un rejeu ne la duplique pas', async () => {
    await setMode(fixture.a, 'auto');
    const ids = await conversation(fixture, fixture.a, {
      question: 'Que signifie la partie double ?',
      answer: 'Chaque opération est enregistrée au débit d’un compte et au crédit d’un autre.',
    });
    const first = await run(fixture, fixture.a, ids, 'Que signifie la partie double ?');
    expect(first.created).toBe(1);
    const actions = await actionRows(fixture.a);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.status).toBe('applied');
    const bricks = await brickRows(fixture.a);
    expect(bricks).toHaveLength(1);
    expect(typeof actions[0]?.payload.brickId).toBe('string');

    const state = await serviceDb().execute<{ in_review: boolean; due_at: Date }>(sql`
      select in_review, due_at from public.notion_states
      where user_id = ${fixture.a.id}::uuid and notion_id = ${fixture.notionId}::uuid
    `);
    expect(state[0]?.in_review).toBe(true);
    expect(new Date(state[0]?.due_at ?? 0).toISOString()).toBe('2026-11-12T23:00:00.000Z');

    const duplicate = await run(fixture, fixture.a, ids, 'Que signifie la partie double ?');
    expect(duplicate.created).toBe(0);
    expect(duplicate.duplicateIds).toHaveLength(1);
    expect(await actionRows(fixture.a)).toHaveLength(1);
    expect(await brickRows(fixture.a)).toHaveLength(1);
    expect(await outboxCount(`automation-action:${actions[0]?.id ?? ''}`)).toBe(1);
  });

  it('CA-3 — entrée invalide, lecture d’autrui, conflit et double envoi', async () => {
    const invalid = await runAutomation(engine(fixture.clock), {
      key: 'questions_cartes',
      userId: fixture.a.id,
      trigger: {
        type: 'event',
        name: 'tutor/question-asked',
        data: { userId: fixture.a.id },
      },
    });
    if (!invalid.ok) throw invalid.error;
    expect(invalid.value.created).toBe(0);
    expect(await actionRows(fixture.a)).toHaveLength(0);

    const ids = await conversation(fixture, fixture.a, {
      question: 'Quelle est la différence entre un ledger et un journal ?',
      answer: 'Le journal enregistre chronologiquement, le ledger classe par compte.',
    });
    await run(fixture, fixture.a, ids, 'Quelle est la différence entre un ledger et un journal ?');
    const pending = await actionRows(fixture.a);
    const actionId = pending[0]?.id ?? '';

    const foreign = await acceptAutomationAction(context(fixture.b, fixture.clock), { actionId });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');

    const declined = await declineAutomationAction(context(fixture.a, fixture.clock), {
      actionId,
    });
    if (!declined.ok) throw declined.error;
    expect(declined.value.status).toBe('declined');
    expect(await brickRows(fixture.a)).toHaveLength(0);
    const conflict = await acceptAutomationAction(context(fixture.a, fixture.clock), { actionId });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe('CONFLICT');

    const second = await conversation(fixture, fixture.a, {
      question: 'Quand utilise-t-on un compte de produit ?',
      answer: 'Un compte de produit enregistre les ventes et prestations.',
    });
    const first = await run(
      fixture,
      fixture.a,
      second,
      'Quand utilise-t-on un compte de produit ?',
    );
    const replay = await run(
      fixture,
      fixture.a,
      second,
      'Quand utilise-t-on un compte de produit ?',
    );
    expect(first.created).toBe(1);
    expect(replay.created).toBe(0);
    expect(await outboxCount(`automation-action:${first.actionIds[0] ?? ''}`)).toBe(1);
  });

  it('CL-3 — réponse absente, notion absente ou source signalée : aucune écriture', async () => {
    const noAnswer = await conversation(fixture, fixture.a, {
      question: 'Qu’est-ce qu’un compte de tiers ?',
      answer: null,
    });
    const missing = await run(fixture, fixture.a, noAnswer, 'Qu’est-ce qu’un compte de tiers ?');
    expect(missing.created).toBe(0);

    const noNotion = await conversation(fixture, fixture.a, {
      question: 'Comment fonctionne la TVA ?',
      answer: 'La TVA collectée est un compte de tiers.',
    });
    const unknown = await run(fixture, fixture.a, noNotion, 'Comment fonctionne la TVA ?', []);
    expect(unknown.created).toBe(0);

    await serviceDb().execute(sql`
      update public.course_sections
      set reported = true,
          notion_ids = array[${fixture.notionId}::uuid]
      where course_id = ${fixture.courseId}::uuid
    `);
    const reported = await conversation(fixture, fixture.a, {
      question: 'Que porte la clé de comptabilisation ?',
      answer: 'La clé appartient au poste et dépend du compte.',
    });
    const excluded = await run(
      fixture,
      fixture.a,
      reported,
      'Que porte la clé de comptabilisation ?',
    );
    expect(excluded.created).toBe(0);
    expect(await actionRows(fixture.a)).toHaveLength(0);
    expect(await brickRows(fixture.a)).toHaveLength(0);
  });

  it('CL-5 — l’annulation retire la carte des tirages, une action consommée la refuse', async () => {
    await setMode(fixture.a, 'auto');
    const ids = await conversation(fixture, fixture.a, {
      question: 'À quoi sert le plan comptable ?',
      answer: 'Il classe les comptes selon leur nature.',
    });
    await run(fixture, fixture.a, ids, 'À quoi sert le plan comptable ?');
    const actions = await actionRows(fixture.a);
    const actionId = actions[0]?.id ?? '';
    const brickId = actions[0]?.payload.brickId;
    const undone = await undoAutomationAction(context(fixture.a, fixture.clock), { actionId });
    if (!undone.ok) throw undone.error;
    expect(undone.value.status).toBe('undone');
    const retired = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.bricks where id = ${String(brickId)}::uuid
    `);
    expect(retired[0]?.status).toBe('retired');

    const secondIds = await conversation(fixture, fixture.a, {
      question: 'Qu’est-ce qu’un exercice comptable ?',
      answer: 'Une période annuelle de référence.',
    });
    await run(fixture, fixture.a, secondIds, 'Qu’est-ce qu’un exercice comptable ?');
    const second = (await actionRows(fixture.a)).find((row) => row.status === 'applied');
    const secondId = second?.id ?? '';
    await markConsumed(serviceDb(), { actionId: secondId, userId: fixture.a.id });
    const refused = await undoAutomationAction(context(fixture.a, fixture.clock), {
      actionId: secondId,
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
  });
});

afterAll(async () => {
  await closeDb();
});
