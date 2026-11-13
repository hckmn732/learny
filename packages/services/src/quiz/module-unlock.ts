import { ENGINE } from '@learny/config/product';
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import { createNotionCard } from '@learny/learning-engine';
import { notify } from '@learny/notifications';

import type { ServiceContext } from '../context';
import { toPersistenceCard } from '../learning/apply-result';
import { replanUser } from '../planning';
import { toResult } from '../resources/result';

// Unlock of the next module after a passed validation quiz (SPEC-612 EF-7, ET-3, BR-QUI-05,
// BR-FOR-07, CL-2, CL-3, CL-4, CL-10). One transaction performs every domain write and queues
// `module/validated` and `formation/completed`; the notification is sent after the commit with a
// stable dedupe key. A replay finds the module already validated and changes only `best_score`.

export interface ModuleUnlockInput {
  userId: string;
  formationId: string;
  moduleId: string;
  attemptId: string;
  score: number;
  passed: boolean;
}

export interface ModuleUnlockOutcome {
  unlocked: boolean;
  revisionOnly: boolean;
  formationCompleted: boolean;
  nextModuleId: string | null;
  nextModulePosition: number | null;
  nextModuleTitle: string | null;
}

interface ModuleRow extends Record<string, unknown> {
  id: string;
  formation_id: string;
  formation_title: string;
  group_id: string | null;
  position: number;
  title: string;
  status: string;
  validated: boolean;
}

interface NextModuleRow extends Record<string, unknown> {
  id: string;
  position: number;
  title: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

async function readModule(tx: DbTx, userId: string, moduleId: string): Promise<ModuleRow> {
  const rows = await tx.execute<ModuleRow>(sql`
    select m.id::text as id,
           m.formation_id::text as formation_id,
           f.title as formation_title,
           f.group_id::text as group_id,
           m.position::int as position,
           m.title,
           m.status::text as status,
           coalesce(mp.status = 'validated', false) as validated
    from public.modules m
    join public.formations f on f.id = m.formation_id
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    where m.id = ${moduleId}::uuid
      and (f.owner_id = ${userId}::uuid or exists (
        select 1
        from public.groups g
        join public.group_members gm on gm.group_id = g.id
        where g.formation_id = f.id
          and gm.user_id = ${userId}::uuid
          and gm.member_status = 'active'
          and gm.left_at is null
      ))
    limit 1
  `);
  const module = rows[0];
  if (module === undefined) throw new AppError('NOT_FOUND', 'Module introuvable.');
  return module;
}

async function nextModuleOf(
  tx: DbTx,
  formationId: string,
  position: number,
): Promise<NextModuleRow | null> {
  const rows = await tx.execute<NextModuleRow>(sql`
    select id::text as id, position::int as position, title
    from public.modules
    where formation_id = ${formationId}::uuid and position > ${position}
    order by position asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function validateModule(
  tx: DbTx,
  userId: string,
  module: ModuleRow,
  score: number,
  now: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into public.module_progress (
      user_id, module_id, status, opened_at, validated_at, best_score, updated_at
    ) values (
      ${userId}::uuid, ${module.id}::uuid, 'validated'::public.module_status, ${now.toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz, ${score}, ${now.toISOString()}::timestamptz
    )
    on conflict (user_id, module_id) do update set
      status = 'validated'::public.module_status,
      opened_at = coalesce(module_progress.opened_at, excluded.opened_at),
      validated_at = coalesce(module_progress.validated_at, excluded.validated_at),
      best_score = greatest(coalesce(module_progress.best_score, 0), excluded.best_score),
      updated_at = excluded.updated_at
  `);
  if (module.group_id === null) {
    // BR-FOR-07 — an individual formation mirrors the owner's progress on the shared module row.
    await tx.execute(sql`
      update public.modules
      set status = 'validated'::public.module_status
      where id = ${module.id}::uuid and status <> 'validated'
    `);
  }
}

async function openNextModule(
  tx: DbTx,
  userId: string,
  module: ModuleRow,
  next: NextModuleRow,
  now: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into public.module_progress (
      user_id, module_id, status, opened_at, updated_at
    ) values (
      ${userId}::uuid, ${next.id}::uuid, 'open'::public.module_status, ${now.toISOString()}::timestamptz,
      ${now.toISOString()}::timestamptz
    )
    on conflict (user_id, module_id) do update set
      status = (case when module_progress.status = 'validated' then 'validated' else 'open' end)::public.module_status,
      opened_at = coalesce(module_progress.opened_at, excluded.opened_at),
      updated_at = excluded.updated_at
  `);
  if (module.group_id === null) {
    await tx.execute(sql`
      update public.modules
      set status = 'open'::public.module_status
      where id = ${next.id}::uuid and status = 'locked'
    `);
  }
}

async function addNotionsToReview(
  tx: DbTx,
  userId: string,
  moduleId: string,
  now: Date,
): Promise<void> {
  const card = JSON.stringify(
    toPersistenceCard(createNotionCard(now.toISOString(), ENGINE.fsrs.requestRetention)),
  );
  await tx.execute(sql`
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
      success_count, in_review, revision
    )
    select ${userId}::uuid, n.id, ${card}::jsonb, ${now.toISOString()}::timestamptz,
           0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz,
           0, true, 0
    from public.notions n
    where n.module_id = ${moduleId}::uuid
    on conflict (user_id, notion_id) do update set
      in_review = true,
      revision = notion_states.revision + 1
  `);
}

async function sendNotification(
  ctx: ServiceContext,
  userId: string,
  module: ModuleRow,
  next: NextModuleRow | null,
  score: number,
): Promise<void> {
  const href =
    next === null
      ? `/formations/${module.formation_id}/bilan`
      : `/formations/${module.formation_id}/programme`;
  const result = await notify(
    {
      requestId: ctx.requestId,
      sdb: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    },
    {
      userId,
      formationId: module.formation_id,
      type: 'module_validated',
      data: {
        modulePosition: module.position,
        moduleTitle: module.title,
        score,
        ...(next === null
          ? { isLastModule: true, href }
          : { nextModulePosition: next.position, nextModuleTitle: next.title, href }),
      },
      dedupeKey: `module_validated:${module.id}`,
    },
  );
  if (!result.ok) {
    ctx.logger.warn('module-unlock.notify.failed', { outcome: 'notification_failed' });
  }
}

/**
 * ET-3 — idempotent unlock function. `passed=true` only; a passed attempt on an already validated
 * module updates `best_score` only (CL-3) and produces no new milestone, notification or event.
 */
export function unlockModule(
  ctx: ServiceContext,
  input: ModuleUnlockInput,
): Promise<Result<ModuleUnlockOutcome>> {
  return toResult(async () => {
    if (!UUID.test(input.userId)) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant utilisateur invalide.');
    }
    if (ctx.db === null) {
      throw new AppError('INTERNAL_ERROR', 'Client base de données manquant.');
    }
    if (!input.passed) {
      return {
        unlocked: false,
        revisionOnly: false,
        formationCompleted: false,
        nextModuleId: null,
        nextModulePosition: null,
        nextModuleTitle: null,
      };
    }
    const score = Math.min(100, Math.max(0, input.score));
    const now = ctx.clock.now();
    const outcome = await withTransaction(ctx.db, async (tx, outbox) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`module-unlock:${input.userId}:${input.moduleId}`}, 0))`,
      );
      const module = await readModule(tx, input.userId, input.moduleId);
      if (module.validated) {
        await tx.execute(sql`
          update public.module_progress
          set best_score = greatest(coalesce(best_score, 0), ${score}),
              updated_at = ${now.toISOString()}::timestamptz
          where user_id = ${input.userId}::uuid and module_id = ${module.id}::uuid
        `);
        return {
          unlocked: false,
          revisionOnly: true,
          formationCompleted: false,
          nextModuleId: null,
          nextModulePosition: null,
          nextModuleTitle: null,
        };
      }
      const next = await nextModuleOf(tx, module.formation_id, module.position);
      await validateModule(tx, input.userId, module, score, now);
      if (next !== null) {
        await openNextModule(tx, input.userId, module, next, now);
      }
      await addNotionsToReview(tx, input.userId, module.id, now);
      outbox.add(
        'module/validated',
        {
          userId: input.userId,
          formationId: module.formation_id,
          moduleId: module.id,
          score,
          nextModuleId: next?.id ?? null,
        },
        { id: `module-validated:${module.id}` },
      );
      if (next === null) {
        outbox.add(
          'formation/completed',
          {
            userId: input.userId,
            formationId: module.formation_id,
            completedAt: now.toISOString(),
          },
          { id: `formation-completed:${module.formation_id}` },
        );
      }
      return {
        unlocked: true,
        revisionOnly: false,
        formationCompleted: next === null,
        nextModuleId: next?.id ?? null,
        nextModulePosition: next?.position ?? null,
        nextModuleTitle: next?.title ?? null,
      };
    });

    if (outcome.unlocked) {
      // Milestones are written by the services through the owner-role client (SPEC-408 policy);
      // the unique key keeps the replay idempotent even outside the unlock transaction.
      await serviceDb().execute(sql`
        insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
        values (
          ${input.userId}::uuid, ${input.formationId}::uuid, 'module_validated',
          ${input.moduleId}::uuid, ${now.toISOString()}::timestamptz
        )
        on conflict (user_id, key, ref_id) do nothing
      `);
      await sendNotification(
        ctx,
        input.userId,
        await readModuleAfter(ctx, input.userId, input.moduleId),
        outcome.nextModuleId === null
          ? null
          : {
              id: outcome.nextModuleId,
              position: outcome.nextModulePosition ?? 0,
              title: outcome.nextModuleTitle ?? '',
            },
        score,
      );
      try {
        await replanUser(ctx, now);
      } catch (cause) {
        ctx.logger.warn('module-unlock.replan.failed', { outcome: 'replan_failed' }, cause);
      }
    }
    return outcome;
  });
}

async function readModuleAfter(
  ctx: ServiceContext,
  userId: string,
  moduleId: string,
): Promise<ModuleRow> {
  if (ctx.db === null) throw new AppError('INTERNAL_ERROR', 'Client base de données manquant.');
  return ctx.db.run((tx) => readModule(tx, userId, moduleId));
}

/** Helper used by the job and the tests: the event payload of `quiz/graded`. */
export function unlockInputFromEvent(data: {
  userId: string;
  formationId: string;
  moduleId: string;
  attemptId: string;
  score: number;
  passed: boolean;
}): ModuleUnlockInput {
  return {
    userId: data.userId,
    formationId: data.formationId,
    moduleId: data.moduleId,
    attemptId: data.attemptId,
    score: data.score,
    passed: data.passed,
  };
}
