// Registry of tutor actions (docs/architecture/ai.md §3). SPEC-508 declares these tools to the model
// in strict mode and executes them after `guard`; SPEC-512 adds the first one.
import { WEB_SEARCH_TASKS, type TutorTask } from '../tasks';

import { searchWebTool } from './search-web';

export const TUTOR_TOOLS = {
  search_web: searchWebTool,
} as const;

export type TutorToolName = keyof typeof TUTOR_TOOLS;

/** Tasks allowed to see each action; the table grows with the registry (SPEC-508). */
const TOOL_TASKS: Record<TutorToolName, readonly TutorTask[]> = {
  search_web: WEB_SEARCH_TASKS,
};

/** EF-1 — the same guard as the action, usable by the loop to hide a tool from a task. */
export function toolAllowedForTask(task: TutorTask, name: TutorToolName): boolean {
  return TOOL_TASKS[name].includes(task);
}
