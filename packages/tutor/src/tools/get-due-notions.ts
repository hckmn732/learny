import { DueNotionsSchema } from '@learny/contracts';

import { ALLOW, defineTutorTool, notFound } from './types';
import { accessibleFormation } from './guard-helpers';
import { GetDueNotionsInput, TOOL_NAMES } from './schemas';

/** ai.md §3 — due dates come from the engine; the model never computes one. */
export const getDueNotionsTool = defineTutorTool({
  name: TOOL_NAMES.getDueNotions,
  description:
    'Read the notions due for review in a formation at an instant. Dates are computed by the FSRS engine and returned as data; never invent or shift a due date.',
  inputSchema: GetDueNotionsInput,
  outputSchema: DueNotionsSchema,
  async guard(ctx, input) {
    const formationId = await accessibleFormation(ctx, input.formationId);
    return formationId === null ? notFound() : ALLOW;
  },
  async execute(ctx, input) {
    return ctx.runtime.getDueNotions(ctx, input);
  },
});
