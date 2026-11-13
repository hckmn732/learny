import { accessibleFormation } from './guard-helpers';
import {
  ScheduleReminderInput,
  ScheduleReminderOutput,
  TOOL_NAMES,
} from './schemas';
import { ALLOW, defineTutorTool, notFound, refuse } from './types';

/**
 * ai.md §3, BR-NOT-04/05 — schedules a relance through the notification service. Quiet hours and
 * the daily cap are applied inside the transaction; a repeated dedupe key returns the first row.
 */
export const scheduleReminderTool = defineTutorTool({
  name: TOOL_NAMES.scheduleReminder,
  description:
    'Schedule a reminder through the notification service. Quiet hours move the instant, the daily cap refuses an extra external channel, and the dedupe key makes a replay idempotent.',
  inputSchema: ScheduleReminderInput,
  outputSchema: ScheduleReminderOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    if (new Date(input.at).getTime() <= ctx.now.getTime()) {
      return refuse('VALIDATION_FAILED', 'Le rappel doit être programmé dans le futur.');
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.scheduleReminder(ctx, input);
  },
});
