import { accessibleFormation, inFormation } from './guard-helpers';
import {
  AssembleActivityInput,
  AssembleActivityOutput,
  TOOL_NAMES,
} from './schemas';
import { ALLOW, defineTutorTool, notFound } from './types';

/** ai.md §3, BR-BRI-09 — an activity only assembles valid bricks owned by the learner. */
export const assembleActivityTool = defineTutorTool({
  name: TOOL_NAMES.assembleActivity,
  description:
    'Assemble valid brick versions, owned by the learner, into an activity (validation quiz, global quiz session, remediation, exercise, mock exam). A ready activity is checked transactionally before insert.',
  inputSchema: AssembleActivityInput,
  outputSchema: AssembleActivityOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    if (input.moduleId !== undefined) {
      const module = await ctx.runtime.module(ctx, input.moduleId);
      if (module === null || !inFormation(module, formationId)) return notFound();
    }
    for (const item of input.items) {
      const brick = await ctx.runtime.brick(ctx, item.brickId);
      if (
        brick === null ||
        brick.formationId !== formationId ||
        brick.status !== 'active'
      ) {
        return notFound();
      }
      const version = await ctx.runtime.brickVersion(ctx, item.brickVersionId);
      if (
        version === null ||
        version.brickId !== item.brickId ||
        version.formationId !== formationId ||
        version.status !== 'active'
      ) {
        return notFound();
      }
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.assembleActivity(ctx, input);
  },
});
