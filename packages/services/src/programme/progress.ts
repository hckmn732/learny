import type {
  ActiveProgrammeFormationStatus,
  ActiveProgrammeIndicatorsDto,
  ActiveProgrammeModuleDto,
  ProgrammeModuleStatus,
  ProgrammeProgress,
} from '@learny/contracts';
import { AppError } from '@learny/core';

// Pure rules of the active programme (SPEC-606 ET-5, BR-PRO-01, BR-FOR-08). The percentage keeps
// the exact counts and only rounds the displayed value: 2 validated modules out of 7 give
// `{ validated: 2, total: 7, percent: 29 }`, never an approximated fraction.

const MS_PER_DAY = 86_400_000;

export function formationProgress(validated: number, total: number): ProgrammeProgress {
  const safeTotal = Math.max(0, Math.trunc(total));
  const safeValidated = Math.min(Math.max(0, Math.trunc(validated)), safeTotal);
  return {
    validated: safeValidated,
    total: safeTotal,
    percent: safeTotal === 0 ? 0 : Math.round((safeValidated / safeTotal) * 100),
  };
}

/** BR-PRO-01 is independent of the formation status: a paused formation keeps its percentage. */
export function programmeIndicators(input: {
  status: ActiveProgrammeFormationStatus;
  modules: readonly { status: ProgrammeModuleStatus }[];
  weeks: number;
  volumeHours: number | null;
  threshold: number;
  hoursPerDay: number;
  studyDaysPerWeek: number;
}): ActiveProgrammeIndicatorsDto {
  const validated = input.modules.filter((module) => module.status === 'validated').length;
  return {
    progress: formationProgress(validated, input.modules.length),
    weeks: Math.max(1, Math.trunc(input.weeks)),
    volumeHours: input.volumeHours,
    threshold: input.threshold,
    hoursPerDay: input.hoursPerDay,
    studyDaysPerWeek: input.studyDaysPerWeek,
  };
}

/** CL-5 — civil dates count real calendar days, never raw milliseconds across a DST change. */
export function calendarWeeks(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
  const days = Math.round((to - from) / MS_PER_DAY) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

export function lockedModuleMessage(
  module: Pick<ActiveProgrammeModuleDto, 'position' | 'unlockAfterPosition'>,
): string {
  const previous = module.unlockAfterPosition ?? Math.max(1, module.position - 1);
  return `Se débloque quand le quiz du module ${String(previous)} est validé.`;
}

/**
 * BR-FOR-08, ET-4 — the same rule guards the screen and the future module API: a locked module
 * never opens, and the refusal carries the unlock condition instead of the module content.
 */
export function assertModuleAccess(
  module: Pick<ActiveProgrammeModuleDto, 'position' | 'status' | 'unlockAfterPosition'>,
): void {
  if (module.status !== 'locked') return;
  throw new AppError('MODULE_LOCKED', lockedModuleMessage(module), { status: 422 });
}
