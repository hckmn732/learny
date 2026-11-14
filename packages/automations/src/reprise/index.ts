// Pure helpers of the `reprise` automation (SPEC-712 ET-2). They never read the clock, the database
// or the process zone: the definition passes every instant, zone and row explicitly.
export {
  detectMissedSlots,
  isNeverRescheduled,
  localDayOf,
  shiftDay,
  isoWeekday,
} from './detect-missed';
export type { MissedSlot, RepriseSlot } from './detect-missed';
export { countInactiveStudyDays } from './inactivity';
export type { DailyActivityRow, InactivityCount, InactivityInput, PausePeriod } from './inactivity';
export { pickReplacement } from './pick-replacement';
export type { PickReplacementInput, PlacementWindow, ReprisePlacement } from './pick-replacement';
export {
  dayOf,
  formatDayInSentence,
  formatDayLabel,
  formatHour,
  formatSlotLabel,
  localHour,
} from './labels';
export { computeReprisePlanOptions } from './plan-options';
export type { PlanOptionInput } from './plan-options';
