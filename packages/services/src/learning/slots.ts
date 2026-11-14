// Completion of a session and consumption of its automation action (SPEC-712 EF-10, BR-AUT-11).
//
// When a session created by an automation becomes `done`, the action that created it can no longer
// be undone: the engine answers 422 `AUTOMATION_ACTION_CONSUMED` and the journal hides the
// « Annuler » button. The status change and the consumption share the caller's transaction.
import { AppError } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

export interface CompleteSlotResult {
  slotId: string;
  status: 'done';
  consumedActionId: string | null;
}

/**
 * EF-10 — marks one planned slot `done`, then consumes the applied automation action whose
 * `undoPayload.createdSlotId` is this slot. A slot created by the planner or the learner has no
 * matching action and stays undoable through the agenda only.
 */
export async function completeScheduleSlot(
  tx: DbTx,
  input: { userId: string; slotId: string; now: Date },
): Promise<CompleteSlotResult> {
  const updated = await tx.execute<{ id: string }>(sql`
    update public.schedule_slots
    set status = 'done', updated_at = ${input.now.toISOString()}::timestamptz
    where id = ${input.slotId}::uuid
      and user_id = ${input.userId}::uuid
      and status in ('planned', 'done')
    returning id::text as id
  `);
  const slot = updated[0];
  if (slot === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');

  const actions = await tx.execute<{ id: string }>(sql`
    update public.automation_actions
    set status = 'consumed',
        decided_at = coalesce(decided_at, ${input.now.toISOString()}::timestamptz)
    where user_id = ${input.userId}::uuid
      and automation = 'reprise'
      and status = 'applied'
      and (undo_payload ->> 'createdSlotId') = ${input.slotId}
    returning id::text as id
  `);
  return {
    slotId: slot.id,
    status: 'done',
    consumedActionId: actions[0]?.id ?? null,
  };
}
