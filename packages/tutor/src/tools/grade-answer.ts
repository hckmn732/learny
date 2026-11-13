import { GradeAnswerInput, GradeAnswerOutput, TOOL_NAMES } from './schemas';
import { ALLOW, defineTutorTool, notFound, refuse } from './types';

/** ai.md §3, BR-BRI-08 — grades an open answer; the score stays within the question scale. */
export const gradeAnswerTool = defineTutorTool({
  name: TOOL_NAMES.gradeAnswer,
  description:
    'Grade one open answer, production, dialogue or summary of a submitted attempt. The score is bounded by the question scale; the feedback explains the verdict with criteria and missing points.',
  inputSchema: GradeAnswerInput,
  outputSchema: GradeAnswerOutput,
  async guard(ctx, input) {
    const attempt = await ctx.runtime.attempt(ctx, input.attemptId);
    if (attempt === null) return notFound();
    if (ctx.formationId !== null && attempt.formationId !== ctx.formationId) return notFound();
    if (attempt.status !== 'submitted' && attempt.status !== 'graded') {
      return refuse('CONFLICT', 'La tentative n’est pas encore soumise.');
    }
    return ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.gradeAnswer(ctx, input);
  },
});
