// SPEC-608 — application services of the course generation and of SCR-07.
export { generateCourse, GenerateCourseInput } from './generate-course';
export type { GenerateCourseOptions } from './generate-course';
export { getModuleCourse } from './get-course';
export { citationFailureSummary, validateCourseCitations } from './validate-citations';
export type {
  CitationIssue,
  CitationIssueCode,
  CitationValidation,
  KnownChunk,
  ResolvedCitation,
} from './validate-citations';
export {
  courseGeneratedEventId,
  courseGenerationKey,
  courseReadyDedupeKey,
} from './version-course';
export type { CourseGenerationResult } from './version-course';
