import { FinalReviewMode, type FinalReviewDto, type MaintenanceInput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { isUuid, toIso, type FinalReviewFormationRow } from './final-review';
import { getFinalReview } from './get-final-review';
import { cancelFutureSlots } from './state';

// POST /formations/:fid/maintenance — choose or change the memory interview of a completed
// formation (SPEC-617 EF-2, ET-2, ET-3, CL-2, CL-3, CL-4; BR-FOR-12, ADR-0015).
//
// The transition is owner-only and transactional: the formation row is locked, every future slot
// is cancelled when the interview stops, and one `formation/maintenance-changed` event joins the
// same commit. Repeating the same mode writes nothing and emits nothing, so a replayed request is
// a no-op. Past attempts, reviews and gap history are never touched.

interface MaintenanceFormationRow extends FinalReviewFormationRow {
  module_count: number;
  validated_count: number;
}

async function readFormationForMaintenance(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<MaintenanceFormationRow> {
  const rows = await tx.execute<MaintenanceFormationRow>(sql`
    select f.id::text as id,
           f.owner_id::text as owner_id,
           f.title,
           f.monogram,
           f.accent_color::text as accent,
           f.status::text as status,
           f.default_threshold::int as default_threshold,
           f.start_date::text as start_date,
           f.completed_at,
           f.maintenance_mode::text as maintenance_mode,
           f.updated_at,
           (
             select count(*)::int
             from public.modules m
             where m.formation_id = f.id
           ) as module_count,
           (
             select count(*)::int
             from public.modules m
             left join public.module_progress mp
               on mp.module_id = m.id and mp.user_id = ${userId}::uuid
             where m.formation_id = f.id
               and coalesce(mp.status, m.status) = 'validated'
           ) as validated_count
    from public.formations f
    where f.id = ${formationId}::uuid
      and f.owner_id = ${userId}::uuid
    for update
  `);
  const formation = rows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  return formation;
}

function assertCompleted(formation: MaintenanceFormationRow): void {
  if (
    formation.status !== 'completed' ||
    formation.module_count === 0 ||
    formation.validated_count < formation.module_count
  ) {
    throw new AppError(
      'CONFLICT',
      'L’entretien de mémoire ne se règle qu’une fois tous les modules validés.',
      { status: 409 },
    );
  }
}

function assertVersion(formation: MaintenanceFormationRow, expectedUpdatedAt?: string): void {
  if (expectedUpdatedAt === undefined) return;
  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) {
    throw new AppError('VALIDATION_FAILED', 'Version de formation invalide.');
  }
  if (toIso(formation.updated_at) !== expected.toISOString()) {
    throw new AppError(
      'CONFLICT',
      'Cette formation a changé entre-temps. Rechargez le bilan avant de choisir.',
      {
        status: 409,
        errors: [
          {
            path: 'expectedUpdatedAt',
            message: `Version actuelle : ${toIso(formation.updated_at)}`,
          },
        ],
      },
    );
  }
}

/**
 * ADR-0112, ADR-0015 — a stopped interview must not deliver a reminder that was already
 * scheduled. The delivery journal belongs to the notification service, so this service-level
 * write happens after the owner-scoped transition; the notification rows themselves stay intact.
 */
async function skipScheduledReminders(userId: string, formationId: string): Promise<void> {
  await serviceDb().execute(sql`
    update public.notification_deliveries d
    set status = 'skipped_pref'::public.delivery_status,
        scheduled_for = null,
        error = 'maintenance_stopped'
    from public.notifications n
    where n.id = d.notification_id
      and n.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and d.status in ('scheduled', 'deferred_quiet')
  `);
}

/**
 * EF-2, ET-3 — set `light` or `stopped`; the returned DTO is the exact state the screen shows.
 * A malformed identifier is a 400, a foreign formation a 404, a non-completed one a 409 (CL-1).
 */
export function setMaintenance(
  ctx: ServiceContext,
  formationId: string,
  input: MaintenanceInput,
): Promise<Result<FinalReviewDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!isUuid(formationId)) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const parsedMode = FinalReviewMode.safeParse(input.mode);
    if (!parsedMode.success) {
      throw new AppError('VALIDATION_FAILED', 'Mode d’entretien inconnu.');
    }
    const mode = parsedMode.data;
    const now = ctx.clock.now();

    await withTransaction(db, async (tx, outbox) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`formation-maintenance:${formationId}`}, 0))`,
      );
      const formation = await readFormationForMaintenance(tx, userId, formationId);
      assertCompleted(formation);
      assertVersion(formation, input.expectedUpdatedAt);
      if (formation.maintenance_mode === mode) return;
      await tx.execute(sql`
        update public.formations
        set maintenance_mode = ${mode}::public.maintenance_mode,
            updated_at = ${now.toISOString()}::timestamptz
        where id = ${formationId}::uuid
          and owner_id = ${userId}::uuid
      `);
      if (mode === 'stopped') {
        await cancelFutureSlots(tx, userId, formationId, now);
      }
      outbox.add(
        'formation/maintenance-changed',
        {
          userId,
          formationId,
          mode,
          changedAt: now.toISOString(),
        },
        { id: `formation-maintenance:${formationId}:${now.toISOString()}:${mode}` },
      );
    });

    if (mode === 'stopped') {
      await skipScheduledReminders(userId, formationId);
    }

    const result = await getFinalReview(ctx, formationId);
    if (!result.ok) throw result.error;
    return result.value;
  });
}
