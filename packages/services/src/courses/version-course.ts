// SPEC-608 ET-2, ET-5 — identity and shape of one atomic course version. The transaction itself is
// driven by `generateCourseForModule` in `@learny/tutor`; the identifiers below are deterministic so
// the service, the job and the tests share the same contract.
export type { CourseGenerationResult } from '@learny/tutor';

/** One generation request is identified by the completion event that asked for it. */
export function courseGenerationKey(input: {
  moduleId: string;
  mode: 'auto' | 'force';
  version: string;
}): string {
  return `course-generation:${input.moduleId}:${input.mode}:${input.version}`.slice(0, 200);
}

/** The version event and the "course ready" notification are emitted once per course id. */
export function courseGeneratedEventId(courseId: string): string {
  return `course-generated:${courseId}`;
}

export function courseReadyDedupeKey(courseId: string): string {
  return `course-ready:${courseId}`;
}
