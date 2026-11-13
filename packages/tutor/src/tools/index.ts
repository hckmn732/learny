import type { TutorToolName } from '@learny/contracts';

import { TUTOR_TASKS, WEB_SEARCH_TASKS, type TutorTask } from '../tasks';

import { assembleActivityTool } from './assemble-activity';
import { createOrUpdateTool } from './create-or-update';
import { getDueNotionsTool } from './get-due-notions';
import { gradeAnswerTool } from './grade-answer';
import { prepareQuestionBankTool } from './prepare-question-bank';
import { readResourcesTool } from './read-resources';
import { readResultsTool } from './read-results';
import { scheduleTool } from './schedule';
import { scheduleReminderTool } from './schedule-reminder';
import { searchWebTutorTool } from './search-web';
import type { TutorTool } from './types';

// The closed registry of `docs/architecture/ai.md` §3 (SPEC-508 EF-1). Exactly ten entries, in the
// normative order of the architecture table. A tool absent from this list cannot be called by the
// model: the loop rejects an unknown name before any guard or write (CL-1). SPEC-512 contributes
// `search_web` through the same `TutorTool` contract.
const TOOLS_BY_NAME = {
  read_resources: readResourcesTool,
  search_web: searchWebTutorTool,
  create_or_update: createOrUpdateTool,
  assemble_activity: assembleActivityTool,
  schedule: scheduleTool,
  schedule_reminder: scheduleReminderTool,
  get_due_notions: getDueNotionsTool,
  read_results: readResultsTool,
  grade_answer: gradeAnswerTool,
  prepare_question_bank: prepareQuestionBankTool,
} as const satisfies Record<TutorToolName, TutorTool>;

/** Normative declaration order of the registry; the loop and the demonstration iterate it. */
export const TUTOR_TOOL_LIST: readonly TutorTool[] = [
  readResourcesTool,
  searchWebTutorTool,
  createOrUpdateTool,
  assembleActivityTool,
  scheduleTool,
  scheduleReminderTool,
  getDueNotionsTool,
  readResultsTool,
  gradeAnswerTool,
  prepareQuestionBankTool,
];

/**
 * The ordered registry is iterable (`map`, `for…of`) and also addressable by name, so SPEC-512
 * callers keep `TUTOR_TOOLS.search_web` while SPEC-508 keeps the normative array order.
 */
export const TUTOR_TOOLS: readonly TutorTool[] & Readonly<Record<TutorToolName, TutorTool>> =
  Object.assign([...TUTOR_TOOL_LIST], TOOLS_BY_NAME);

const BY_NAME = new Map<string, TutorTool>(TUTOR_TOOL_LIST.map((tool) => [tool.name, tool]));

export function tutorToolByName(name: string): TutorTool | undefined {
  return BY_NAME.get(name);
}

/** Model-facing declarations; `@learny/llm` declares them strictly and never executes one. */
export function toolDefinitions(): Record<
  string,
  { description: string; inputSchema: TutorTool['inputSchema'] }
> {
  return Object.fromEntries(
    TUTOR_TOOL_LIST.map((tool) => [
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
    ]),
  );
}

export function toolNames(): TutorToolName[] {
  return TUTOR_TOOL_LIST.map((tool) => tool.name);
}

/** Tasks allowed to see each action; the table grows with the registry (SPEC-508, SPEC-512 EF-1). */
const TOOL_TASKS: Record<TutorToolName, readonly TutorTask[]> = {
  read_resources: TUTOR_TASKS,
  search_web: WEB_SEARCH_TASKS,
  create_or_update: TUTOR_TASKS,
  assemble_activity: TUTOR_TASKS,
  schedule: TUTOR_TASKS,
  schedule_reminder: TUTOR_TASKS,
  get_due_notions: TUTOR_TASKS,
  read_results: TUTOR_TASKS,
  grade_answer: TUTOR_TASKS,
  prepare_question_bank: TUTOR_TASKS,
};

/** EF-1 — the same authorization as the action, usable by the loop to hide a tool from a task. */
export function toolAllowedForTask(task: TutorTask, name: TutorToolName): boolean {
  return TOOL_TASKS[name].includes(task);
}

export {
  readResourcesTool,
  searchWebTutorTool,
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
