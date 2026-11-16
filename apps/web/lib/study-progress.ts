import type { QueryClient } from '@tanstack/react-query';

// Queries that summarise the learner's day (QA SCR-03). Finishing a global-quiz session or a
// warm-up changes the streak and the due count of the sidebar and the header, the day card and the
// global-quiz card of the home screen, the agenda slots and the journal of the automations. The
// shell lives across client navigations and these queries keep their cache for 30 s: without an
// explicit invalidation the sidebar and the home screen keep showing the state before the session.
export const STUDY_PROGRESS_QUERY_KEYS = [
  ['sidebar'],
  ['header'],
  ['home'],
  ['agenda'],
  ['automation-actions'],
] as const;

/** Marks every summary of the day stale; mounted queries refetch, the others on their next mount. */
export async function invalidateStudyProgress(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    STUDY_PROGRESS_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}
