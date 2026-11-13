import type { TutorToolName } from '@learny/contracts';

import { assembleActivityTool } from './assemble-activity';
import { createOrUpdateTool } from './create-or-update';
import { getDueNotionsTool } from './get-due-notions';
import { gradeAnswerTool } from './grade-answer';
import { prepareQuestionBankTool } from './prepare-question-bank';
import { readResourcesTool } from './read-resources';
import { readResultsTool } from './read-results';
import { scheduleTool } from './schedule';
import { scheduleReminderTool } from './schedule-reminder';
import { searchWebTool } from './search-web';
import type { TutorTool } from './types';

// The closed registry of `docs/architecture/ai.md` §3 (SPEC-508 EF-1). Exactly ten entries, in the
// normative order of the architecture table. A tool absent from this list cannot be called by the
// model: the loop rejects an unknown name before any guard or write (CL-1).
export const TUTOR_TOOLS: readonly TutorTool[] = [
  readResourcesTool,
  searchWebTool,
  createOrUpdateTool,
  assembleActivityTool,
  scheduleTool,
  scheduleReminderTool,
  getDueNotionsTool,
  readResultsTool,
  gradeAnswerTool,
  prepareQuestionBankTool,
];

const BY_NAME = new Map<string, TutorTool>(TUTOR_TOOLS.map((tool) => [tool.name, tool]));

export function tutorToolByName(name: string): TutorTool | undefined {
  return BY_NAME.get(name);
}

/** Model-facing declarations; `@learny/llm` declares them strictly and never executes one. */
export function toolDefinitions(): Record<string, { description: string; inputSchema: TutorTool['inputSchema'] }> {
  return Object.fromEntries(
    TUTOR_TOOLS.map((tool) => [
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
    ]),
  );
}

export function toolNames(): TutorToolName[] {
  return TUTOR_TOOLS.map((tool) => tool.name);
}

export {
  readResourcesTool,
  searchWebTool,
  createOrUpdateTool,
  assembleActivityTool,
  scheduleTool,
  scheduleReminderTool,
  getDueNotionsTool,
  readResultsTool,
  gradeAnswerTool,
  prepareQuestionBankTool,
};
export * from './types';
export * from './schemas';
export * from './runtime';
