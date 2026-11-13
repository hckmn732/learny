import { accessibleFormation, inFormation } from './guard-helpers';
import {
  PrepareQuestionBankInput,
  PrepareQuestionBankOutput,
  TOOL_NAMES,
} from './schemas';
import { ALLOW, defineTutorTool, notFound, refuse } from './types';

/**
 * ai.md §3, BR-MEM-07 — prepares a batch of variants only when the bank is exhausted (fewer than
 * `count` active bank bricks for the requested notions and format). The batch port is wired by
 * SPEC-513; without it the execution refuses safely instead of inventing a request.
 */
export const prepareQuestionBankTool = defineTutorTool({
  name: TOOL_NAMES.prepareQuestionBank,
  description:
    'Request a batch of question-bank variants for notions and a format, only when fewer than the requested count already exist. The batch is launched asynchronously; the action returns its request identifier.',
  inputSchema: PrepareQuestionBankInput,
  outputSchema: PrepareQuestionBankOutput,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    if (formationId === null) return notFound();
    for (const notionId of input.notionIds) {
      const notion = await ctx.runtime.notion(ctx, notionId);
      if (notion === null || !inFormation(notion, formationId)) return notFound();
    }
    const available = await ctx.runtime.bankCount(ctx, input.notionIds, input.format);
    if (available >= input.count) {
      return refuse('CONFLICT', 'La banque contient déjà assez de variantes.');
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.prepareQuestionBank(ctx, input);
  },
});
