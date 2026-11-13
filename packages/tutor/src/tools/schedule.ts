import { ALLOW, defineTutorTool, notFound, refuse } from './types';
import { accessibleFormation, inFormation } from './guard-helpers';
import { ScheduleInput, ScheduleOutput, TOOL_NAMES } from './schemas';

/** ai.md §3 — the planner places an activity; the guard respects the learner’s availability. */
export const scheduleTool = defineTutorTool({
  name: TOOL_NAMES.schedule,
  description:
    'Place an activity in the learner’s agenda. The guard refuses a past window and any overlap with an existing planned or missed slot; the write uses the planner service.',
  inputSchema: ScheduleInput,
  outputSchema: ScheduleOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    if (input.moduleId !== undefined) {
      const module = await ctx.runtime.module(ctx, input.moduleId);
      if (module === null || !inFormation(module, formationId)) return notFound();
    }
    if (input.activityId !== undefined) {
      const activity = await ctx.runtime.activity(ctx, input.activityId);
      if (activity === null || !inFormation(activity, formationId)) return notFound();
    }
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt.getTime() <= ctx.now.getTime()) {
      return refuse('VALIDATION_FAILED', 'Le créneau doit commencer dans le futur.');
    }
    if (await ctx.runtime.slotOverlap(ctx, startsAt, endsAt)) {
      return refuse('CONFLICT', 'Ce créneau chevauche un créneau déjà planifié.');
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.schedule(ctx, input);
  },
});
