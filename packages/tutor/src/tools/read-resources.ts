import { ALLOW, defineTutorTool, notFound, refuse } from './types';
import { accessibleFormation, inFormation } from './guard-helpers';
import { ReadResourcesInput, ReadResourcesOutput, TOOL_NAMES } from './schemas';

/** ai.md §3 — read the useful passages of a chapter/module/formation; read-only, token-budgeted. */
export const readResourcesTool = defineTutorTool({
  name: TOOL_NAMES.readResources,
  description:
    'Read the learner’s own resource passages for a chapter, module or formation. Read-only. The result is limited by the task token budget and never includes another learner’s content.',
  inputSchema: ReadResourcesInput,
  outputSchema: ReadResourcesOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    if (input.moduleId !== undefined) {
      const module = await ctx.runtime.module(ctx, input.moduleId);
      if (module === null || !inFormation(module, formationId)) return notFound();
    }
    if (input.chapterId !== undefined) {
      const chapter = await ctx.runtime.chapter(ctx, input.chapterId);
      if (chapter === null || !inFormation(chapter, formationId)) return notFound();
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    const formationId = input.formationId ?? ctx.formationId;
    if (formationId === null) {
      throw new Error('Formation absente malgré le garde-fou.');
    }
    const result = await ctx.runtime.readPassages(ctx, { ...input, formationId });
    return { ...result, source: 'resources' as const };
  },
});

export { refuse };
