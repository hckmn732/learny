import { accessibleFormation, inFormation } from './guard-helpers';
import { ReadResultsInput, ReadResultsOutput, TOOL_NAMES } from './schemas';
import { ALLOW, defineTutorTool, notFound } from './types';

/** ai.md §3 — read-only results and memory state; another learner is never visible. */
export const readResultsTool = defineTutorTool({
  name: TOOL_NAMES.readResults,
  description:
    'Read the learner’s attempts, scores and memory state for a formation or module. Read-only, bounded and scoped by Row Level Security.',
  inputSchema: ReadResultsInput,
  outputSchema: ReadResultsOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    if (input.moduleId !== undefined) {
      const module = await ctx.runtime.module(ctx, input.moduleId);
      if (module === null || !inFormation(module, formationId)) return notFound();
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    const result = await ctx.runtime.readResults(ctx, input);
    return { ...result, source: 'results' as const };
  },
});
