// Incremental replanning (SPEC-407 ET-3, EF-4). The caller expresses the event through the data:
// a validated module has status `validated`, a paused formation `paused`, a missed session is an
// existing slot `missed`, and a rhythm change updates the availability. The planner preserves
// completed slots, missed history and valid manual moves, then replaces only future computed slots.
import { planSchedule } from './plan';
import type { PlanResult, ReplanScheduleInput } from './types';

export function replanSchedule(input: ReplanScheduleInput): PlanResult {
  return planSchedule(input);
}
