// The two plan options of the inactivity episode (SPEC-712 EF-6, BR-FOR-14). The dialogue of
// SPEC-705 owns the actual replanning; this pure helper only prepares the payload of the pending
// action, restricted to « décaler la fin » and « alléger le programme » (ADR-0199 §3).
import type { ReprisePlanOption } from '@learny/contracts';

export interface PlanOptionInput {
  formationId: string;
  currentEndDate: string;
  /** Projected end date computed by the planner, or null when it cannot finish. */
  projectedEndDate: string | null;
  currentHoursPerDay: number;
  removedMinutes: number | null;
  /** Days between the current and the projected end date, rounded up. */
  extraDays?: number | null;
}

function daysBetween(from: string, to: string): number {
  const [fy = 0, fm = 1, fd = 1] = from.split('-').map(Number);
  const [ty = 0, tm = 1, td = 1] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 60 * 60 * 1000));
}

/** EF-6 — exactly the two options the banner and the journal may offer. */
export function computeReprisePlanOptions(input: PlanOptionInput): ReprisePlanOption[] {
  const extraDays =
    input.extraDays ??
    (input.projectedEndDate === null
      ? null
      : Math.max(0, daysBetween(input.currentEndDate, input.projectedEndDate)));
  const shifted = input.projectedEndDate ?? input.currentEndDate;
  return [
    {
      kind: 'shift_end',
      feasible: true,
      reason: null,
      currentEndDate: input.currentEndDate,
      projectedEndDate: shifted,
      extraDays,
      currentHoursPerDay: input.currentHoursPerDay,
      newHoursPerDay: input.currentHoursPerDay,
      removedMinutes: null,
    },
    {
      kind: 'lighten',
      feasible: true,
      reason: null,
      currentEndDate: input.currentEndDate,
      projectedEndDate: input.currentEndDate,
      extraDays: 0,
      currentHoursPerDay: input.currentHoursPerDay,
      newHoursPerDay: input.currentHoursPerDay,
      removedMinutes: input.removedMinutes,
    },
  ];
}
