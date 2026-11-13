// SPEC-608 ET-4 — verification of the citations of a generated course. The pure resolver lives in
// `@learny/tutor` so the pipeline can call it twice; this module is the public service seam and is
// also used by the unit tests of the specification.
export { citationFailureSummary, validateCourseCitations } from '@learny/tutor';
export type {
  CitationIssue,
  CitationIssueCode,
  CitationValidation,
  KnownChunk,
  ResolvedCitation,
} from '@learny/tutor';
