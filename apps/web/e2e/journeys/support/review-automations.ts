// SPEC-807 ET-1, ET-2 — declared fixture of the revisions journey (EF-3) and of the SPEC-803
// keyboard / reduced-motion global-quiz journeys (ADR-0334). Each call creates its own learner,
// formation, notions, bricks and agenda: nothing is shared with the SPEC-115 demonstration user, so
// the session of the day never depends on what other files of the campaign consumed.
//
// Time travel (ADR-0047): the server and the browser stay frozen at 2026-11-11T12:20:00Z. The
// fixture writes the learner's last reviews at `LAST_REVIEW_AT` (four days earlier) with FSRS due
// dates on `DUE_AT`; reading them at the fixed instant is the clock « advanced » past the due date,
// without ever touching the machine clock. Automation ticks use `createFixedClock(...)` instants.
import { randomUUID } from 'node:crypto';

import type { BrowserContext, Page } from '@playwright/test';

import { activeLegalVersions } from '@learny/config';
import { createBrick, createNotionState, createScheduleSlot } from '@learny/testing';
import { FIXED_TIME_ISO } from '@learny/testing/clock';
import { serviceDb, sql, type DbTx } from '@learny/testing/db';
import { createTestProgramme } from '@learny/testing/db';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

export const NOW_ISO = FIXED_TIME_ISO;
/** Instant of the fixture's previous reviews: four days before the frozen instant. */
export const LAST_REVIEW_AT = '2026-11-07T17:00:00.000Z';
/** FSRS due date written by the fixture: past at the frozen instant, so the notions are due. */
export const DUE_AT = '2026-11-10T07:00:00.000Z';

export type ReviewBank = 'recall' | 'games';

export interface ReviewLearner {
  session: TestSession;
  formationId: string;
  formationTitle: string;
  moduleIds: string[];
  notionIds: string[];
}

function recallPayload(index: number): unknown {
  return {
    front: `Que retenir de la notion de révision numéro ${String(index + 1)} ?`,
    back: `La réponse de la notion de révision numéro ${String(index + 1)}.`,
    sourceLabel: 'votre cours du module 1, chapitre 1',
    sources: [],
  };
}

async function seedGames(
  tx: DbTx,
  userId: string,
  formationId: string,
  notions: readonly string[],
): Promise<void> {
  const [n0, n1, n2, n3, n4, n5, n6, n7] = notions as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const base = { ownerId: userId, formationId, purpose: 'review' as const };
  await createBrick(tx, {
    ...base,
    type: 'recall_card',
    notionIds: [n0],
    payload: recallPayload(0),
  });
  await createBrick(tx, {
    ...base,
    type: 'matching',
    notionIds: [n1, n2, n3],
    payload: {
      instruction: 'Associez chaque document au cycle comptable auquel il se rattache.',
      pairs: [
        { id: 'a', left: 'Facture de vente', right: 'Cycle des ventes', notionId: n1 },
        { id: 'b', left: 'Relevé bancaire', right: 'Cycle de trésorerie', notionId: n2 },
        { id: 'c', left: 'Bulletin de paie', right: 'Cycle des salaires', notionId: n3 },
      ],
      extraRights: ['Cycle des immobilisations'],
      explanation: 'Chaque pièce justificative appartient à un cycle comptable précis.',
      sources: [],
    },
  });
  await createBrick(tx, {
    ...base,
    type: 'categorization',
    notionIds: [n4, n5],
    payload: {
      instruction: 'Classez chaque compte dans la catégorie de bilan qui lui correspond.',
      categories: [
        { id: 'actif', label: 'Actif', notionId: n4 },
        { id: 'passif', label: 'Passif', notionId: n5 },
      ],
      items: [
        { id: 'a', text: 'Banque', categoryId: 'actif' },
        { id: 'b', text: 'Stock de marchandises', categoryId: 'actif' },
        { id: 'c', text: 'Capital social', categoryId: 'passif' },
        { id: 'd', text: 'Emprunt bancaire', categoryId: 'passif' },
      ],
      explanation: 'L’actif regroupe les emplois, le passif les ressources et les dettes.',
      sources: [],
    },
  });
  await createBrick(tx, {
    ...base,
    type: 'ordering',
    notionIds: [n6],
    payload: {
      instruction: 'Remettez dans l’ordre les étapes de la clôture comptable.',
      items: [
        { id: 'a', text: 'Enregistrer les écritures de l’exercice' },
        { id: 'b', text: 'Justifier les soldes des comptes' },
        { id: 'c', text: 'Arrêter et présenter les états financiers' },
      ],
      explanation: 'La clôture suit l’enregistrement, la justification puis l’arrêté.',
      sources: [],
    },
  });
  await createBrick(tx, {
    ...base,
    type: 'cloze',
    notionIds: [n7],
    payload: {
      template: 'L’état annuel présente les {{1}} et les {{2}} de l’exercice.',
      gaps: [
        { id: 1, answers: ['produits', 'revenus'], hint: 'Ce que l’entreprise gagne' },
        { id: 2, answers: ['charges', 'dépenses'], hint: 'Ce que l’entreprise dépense' },
      ],
      explanation: 'Les produits diminués des charges donnent le résultat de l’exercice.',
      sources: [],
    },
  });
}

/**
 * Creates an isolated learner whose notions are all due at the frozen instant.
 * - `recall`: 2 validated modules × 18 notions, one recall card each (36 due notions: more than the
 *   default 15-minute cap, so the `plafond_quiz` automation smooths the day), a planned global-quiz
 *   slot today and tomorrow at 17:00 Paris, and a four-day streak ending yesterday.
 * - `games`: 1 validated module × 8 notions served by one game of each kind (recall card,
 *   matching, categorization, ordering, cloze): all fit under the cap, only the order varies.
 */
export async function seedReviewLearner(options: {
  prefix: string;
  bank: ReviewBank;
}): Promise<ReviewLearner> {
  const tag = randomUUID().slice(0, 8);
  const session = await createTestSession({
    email: `${options.prefix}${tag}@test.learny.test`,
  });
  const userId = session.userId;
  const formationTitle = `Révisions SPEC-807 ${tag}`;
  try {
    const seeded = await serviceDb().transaction(async (tx) => {
      const programme = await createTestProgramme(tx, userId, {
        modules: options.bank === 'recall' ? 2 : 1,
        chaptersPerModule: 1,
        notionsPerChapter: options.bank === 'recall' ? 18 : 8,
        title: formationTitle,
      });
      // SPEC-704 — the agenda screen only paints when the formation carries its planning period:
      // `bounds` are read from `start_date`/`end_date`, and a null bounds shows the empty state even
      // when the slots exist (CL-6). The fixture must therefore date the formation it validates.
      await tx.execute(sql`
        update public.formations
        set start_date = '2026-11-02', end_date = '2026-12-11'
        where id = ${programme.formationId}::uuid
      `);
      for (const moduleId of programme.moduleIds) {
        await tx.execute(sql`
          update public.modules set status = 'validated', threshold = 80
          where id = ${moduleId}::uuid
        `);
        await tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status, validated_at)
          values (${userId}::uuid, ${moduleId}::uuid, 'validated', '2026-11-02T08:00:00Z'::timestamptz)
          on conflict (user_id, module_id) do update
            set status = 'validated', validated_at = excluded.validated_at
        `);
      }
      // SPEC-806 — a learner who signed up accepted the active legal versions.
      const legal = activeLegalVersions();
      await tx.execute(sql`
        insert into public.legal_acceptances (user_id, document, version)
        values
          (${userId}::uuid, 'cgu', ${legal.cgu}),
          (${userId}::uuid, 'privacy', ${legal.privacy})
        on conflict do nothing
      `);
      await tx.execute(sql`
        update public.profiles
        set first_name = 'Léa', onboarding_step = 'done',
            onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
            timezone = 'Europe/Paris',
            current_formation_id = ${programme.formationId}::uuid
        where id = ${userId}::uuid
      `);
      await tx.execute(sql`
        insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
        values (${userId}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{soir}'::study_slot[])
        on conflict (user_id) do update set study_days = '{1,2,3,4,5,6,7}'::smallint[]
      `);
      for (const [index, notionId] of programme.notionIds.entries()) {
        await createNotionState(tx, { userId, notionId, dueAt: new Date(DUE_AT) });
        if (options.bank === 'recall') {
          await createBrick(tx, {
            ownerId: userId,
            formationId: programme.formationId,
            type: 'recall_card',
            purpose: 'review',
            notionIds: [notionId],
            payload: recallPayload(index),
          });
        }
      }
      // The previous reviews happened at LAST_REVIEW_AT (fixture clock), four days ago.
      await tx.execute(sql`
        update public.notion_states
        set first_seen_at = ${LAST_REVIEW_AT}::timestamptz,
            last_seen_at = ${LAST_REVIEW_AT}::timestamptz,
            fsrs = jsonb_set(
              jsonb_set(fsrs, '{last_review}', to_jsonb(${LAST_REVIEW_AT}::text), true),
              '{due}', to_jsonb(${DUE_AT}::text), true
            )
        where user_id = ${userId}::uuid
      `);
      if (options.bank === 'games') {
        await seedGames(tx, userId, programme.formationId, programme.notionIds);
      } else {
        await createScheduleSlot(tx, {
          userId,
          formationId: programme.formationId,
          kind: 'global_quiz',
          title: 'Quiz global du jour',
          startsAt: new Date('2026-11-11T16:00:00Z'),
          endsAt: new Date('2026-11-11T16:15:00Z'),
        });
        await createScheduleSlot(tx, {
          userId,
          formationId: programme.formationId,
          kind: 'global_quiz',
          title: 'Quiz global de demain',
          startsAt: new Date('2026-11-12T16:00:00Z'),
          endsAt: new Date('2026-11-12T16:15:00Z'),
        });
        await tx.execute(sql`
          insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
          values (${userId}::uuid, '2026-11-10'::date, 20, true, '{seed:spec-807}'::text[])
        `);
        await tx.execute(sql`
          update public.profiles
          set streak_days = 4, streak_computed_on = '2026-11-10'::date
          where id = ${userId}::uuid
        `);
      }
      return programme;
    });
    return {
      session,
      formationId: seeded.formationId,
      formationTitle,
      moduleIds: seeded.moduleIds,
      notionIds: seeded.notionIds,
    };
  } catch (error) {
    await deleteTestSession(session);
    throw error;
  }
}

/** Removes the learner and every row it owns (cascade). */
export async function deleteReviewLearner(learner: ReviewLearner | null): Promise<void> {
  if (learner !== null) await deleteTestSession(learner.session);
}

/** Replaces the cookies of the context by the learner's session. */
export async function signInLearner(
  context: BrowserContext,
  learner: Pick<ReviewLearner, 'session'>,
  baseURL: string | undefined,
): Promise<void> {
  await context.clearCookies();
  await context.addCookies(
    learner.session.cookies.map((cookie) => ({
      ...cookie,
      url: baseURL ?? 'http://127.0.0.1:3100',
    })),
  );
}

export function quizUrl(learner: Pick<ReviewLearner, 'formationId'>): string {
  return `/formations/${learner.formationId}/quiz-global`;
}

/* ------------------------------------------------------------------ */
/* Database observations (read-only)                                   */
/* ------------------------------------------------------------------ */

export interface SessionConfigItem {
  position: number;
  format: string;
  notionIds: string[];
}

export interface SessionConfig {
  mode: string;
  dueCount: number;
  deferredCount: number;
  capMinutes: number;
  estimatedSec: number;
  items: SessionConfigItem[];
}

/** Configuration of the learner's global-quiz session of the day (written by the service). */
export async function todaySession(
  userId: string,
): Promise<{ id: string; config: SessionConfig } | null> {
  const rows = await serviceDb().execute<{ id: string; config: SessionConfig }>(sql`
    select id::text as id, config
    from public.activities
    where owner_id = ${userId}::uuid and kind = 'global_quiz_session'::public.activity_kind
    order by created_at desc
    limit 1
  `);
  return rows[0] ?? null;
}

export interface NotionStateRow {
  [key: string]: unknown;
  due_at: string;
  last_seen_at: string;
  mastery: string;
  reps: number;
  fsrs: unknown;
}

export async function notionState(userId: string, notionId: string): Promise<NotionStateRow> {
  const rows = await serviceDb().execute<NotionStateRow>(sql`
    select due_at::text as due_at, last_seen_at::text as last_seen_at, mastery::text as mastery,
           (fsrs ->> 'reps')::int as reps, fsrs
    from public.notion_states
    where user_id = ${userId}::uuid and notion_id = ${notionId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('état de notion absent');
  return row;
}

export async function reviewLogs(
  userId: string,
  notionId?: string,
): Promise<{ source: string; grade: string; reviewed_at: string }[]> {
  return serviceDb().execute<{ source: string; grade: string; reviewed_at: string }>(sql`
    select source::text as source, grade::text as grade, reviewed_at::text as reviewed_at
    from public.review_logs
    where user_id = ${userId}::uuid
      ${notionId === undefined ? sql`` : sql`and notion_id = ${notionId}::uuid`}
    order by reviewed_at asc
  `);
}

export interface LearnerCounters {
  answers: number;
  reviewLogs: number;
  receipts: number;
  streakDays: number;
  todayMinutes: number;
}

/** Counters that a repeated synchronisation must leave unchanged (CL-3). */
export async function learnerCounters(userId: string): Promise<LearnerCounters> {
  const rows = await serviceDb().execute<{
    answers: number;
    review_logs: number;
    receipts: number;
    streak_days: number;
    today_minutes: number;
  }>(sql`
    select
      (select count(*)::int from public.answers a
         join public.attempts at on at.id = a.attempt_id
        where at.user_id = ${userId}::uuid) as answers,
      (select count(*)::int from public.review_logs where user_id = ${userId}::uuid) as review_logs,
      (select count(*)::int from public.offline_sync_receipts where user_id = ${userId}::uuid)
        as receipts,
      (select streak_days from public.profiles where id = ${userId}::uuid) as streak_days,
      coalesce((select minutes from public.daily_activity
                 where user_id = ${userId}::uuid and day = '2026-11-11'::date), 0) as today_minutes
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('compteurs indisponibles');
  return {
    answers: row.answers,
    reviewLogs: row.review_logs,
    receipts: row.receipts,
    streakDays: row.streak_days,
    todayMinutes: row.today_minutes,
  };
}

export interface ActionRow {
  [key: string]: unknown;
  id: string;
  automation: string;
  kind: string;
  status: string;
  summary: string;
  requires_consent: boolean;
  payload: Record<string, unknown>;
}

export async function automationActions(userId: string): Promise<ActionRow[]> {
  return serviceDb().execute<ActionRow>(sql`
    select id::text as id, automation::text as automation, kind, status::text as status, summary,
           requires_consent, payload
    from public.automation_actions
    where user_id = ${userId}::uuid
    order by created_at asc, id asc
  `);
}

export async function notificationsOf(
  userId: string,
): Promise<{ type: string; dedupe_key: string | null; created_at: string }[]> {
  return serviceDb().execute<{ type: string; dedupe_key: string | null; created_at: string }>(sql`
    select type::text as type, dedupe_key, created_at::text as created_at
    from public.notifications
    where user_id = ${userId}::uuid
    order by created_at asc
  `);
}

/** External deliveries actually sent on a Paris civil day (the daily cap counts these). */
export async function sentDeliveriesOn(userId: string, day: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(distinct n.id)::int as count
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where n.user_id = ${userId}::uuid
      and d.status::text = 'sent'
      and (coalesce(d.sent_at, n.created_at) at time zone 'Europe/Paris')::date = ${day}::date
  `);
  return rows[0]?.count ?? 0;
}

export async function automationSetting(
  userId: string,
  key: string,
): Promise<{ enabled: boolean; params: Record<string, unknown> } | null> {
  const rows = await serviceDb().execute<{ enabled: boolean; params: Record<string, unknown> }>(
    sql`
      select enabled, params from public.automation_settings
      where user_id = ${userId}::uuid and key = ${key}
    `,
  );
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Browser offline storage (SPEC-801), read without creating it        */
/* ------------------------------------------------------------------ */

/** Formation ids of the packs stored in IndexedDB; empty while the store does not exist yet. */
export async function storedPackFormations(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((database) => database.name ?? '');
    if (!names.includes('learny-offline')) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('learny-offline');
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('indexedDB'));
      };
    });
    try {
      if (!db.objectStoreNames.contains('packs')) return [];
      return await new Promise<string[]>((resolve, reject) => {
        const request = db.transaction('packs', 'readonly').objectStore('packs').getAll();
        request.onsuccess = () => {
          resolve((request.result as { formationId: string }[]).map((pack) => pack.formationId));
        };
        request.onerror = () => {
          reject(request.error ?? new Error('packs'));
        };
      });
    } finally {
      db.close();
    }
  });
}

/** Entries of the offline queue, in the payload shape of `POST /api/v1/sync/offline-answers`. */
export async function queuedEntries(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('learny-offline');
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('indexedDB'));
      };
    });
    try {
      const entries = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = db.transaction('queue', 'readonly').objectStore('queue').getAll();
        request.onsuccess = () => {
          resolve(request.result as Record<string, unknown>[]);
        };
        request.onerror = () => {
          reject(request.error ?? new Error('queue'));
        };
      });
      const keys = [
        'clientId',
        'kind',
        'formationId',
        'sessionId',
        'position',
        'brickVersionId',
        'skipped',
        'response',
        'timeMs',
        'selfGrade',
        'answeredAt',
      ];
      return entries.map((entry) =>
        Object.fromEntries(
          keys.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]),
        ),
      );
    } finally {
      db.close();
    }
  });
}
