// Tasks of the tutor (docs/architecture/ai.md §1). Kept local because the architecture forbids
// `tutor → config`; the values are the five documented tasks, not product tuning values.
export const TUTOR_TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;
export type TutorTask = (typeof TUTOR_TASKS)[number];

/** BR-IA-12 — web search is reserved to programme design (and resource suggestions). */
export const WEB_SEARCH_TASKS: readonly TutorTask[] = ['programme'];

export function isTutorTask(value: string): value is TutorTask {
  return (TUTOR_TASKS as readonly string[]).includes(value);
}
