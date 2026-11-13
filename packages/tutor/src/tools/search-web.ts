import { ALLOW, defineTutorTool, notFound, refuse } from './types';
import { accessibleFormation } from './guard-helpers';
import { SearchWebInput, SearchWebOutput, TOOL_NAMES } from './schemas';

/**
 * ai.md §3 — web search is reserved to the programme task and never inserted into a course. The
 * port is provided by SPEC-512; without it the action refuses safely instead of inventing results.
 */
export const searchWebTool = defineTutorTool({
  name: TOOL_NAMES.searchWeb,
  description:
    'Search the web to design a programme or suggest resources. Only available for the programme task; results can never be inserted into a course as citations.',
  inputSchema: SearchWebInput,
  outputSchema: SearchWebOutput,
  async guard(ctx, input) {
    if (ctx.task !== 'programme') {
      return refuse('FORBIDDEN', 'Cette action est réservée à la conception du programme.');
    }
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    return ALLOW;
  },
  async execute(ctx, input) {
    const result = await ctx.runtime.searchWeb(ctx, input);
    return { ...result, source: 'web' as const };
  },
});
