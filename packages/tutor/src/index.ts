// Public API of @learny/tutor (SPEC-508): the ten actions, the deterministic loop and the prompt
// builder. SPEC-512 contributes the web search engine and the resource suggestions. Model
// providers and provider SDKs are never imported here.
export { runTutor } from './loop';
export type { RunTutorRequest } from './loop';
export { buildTutorPrompt, createTutorContext, escapeTutorData, PROMPT_VERSIONS } from './context';
export type {
  BuiltTutorPrompt,
  CreateTutorContextOptions,
  TutorContext,
  TutorLlmSession,
} from './context';
export {
  TUTOR_TOOLS,
  TUTOR_TOOL_LIST,
  toolDefinitions,
  toolNames,
  tutorToolByName,
  createDbNotifier,
  createDbToolRuntime,
  READ_RESOURCES_TOKEN_BUDGET,
  toolAllowedForTask,
} from './tools/index';
export type {
  TutorTool,
  ToolContext,
  ToolScope,
  TutorNotifier,
  TutorToolRuntime,
  WebSearchPort,
  QuestionBankPort,
  CourseLanguage,
  TutorTask,
  TutorToolName,
} from './tools/index';
export * from './tools/schemas';
export {
  SEARCH_WEB_TOOL_NAME,
  createWebSearchPort,
  guardSearchWeb,
  searchWeb,
  searchWebTool,
  searchWebTutorTool,
} from './tools/search-web';
export type { SearchWebContext, SearchWebSecrets } from './tools/search-web';
export type {
  TutorActionInfo,
  TutorDocument,
  TutorInput,
  TutorProfile,
  TutorRunResult,
  TutorToolCall,
  TutorTone,
} from '@learny/contracts';
export { isTutorTask, TUTOR_TASKS, WEB_SEARCH_TASKS } from './tasks';
export {
  decideResourceSuggestion,
  listResourceSuggestions,
  suggestResource,
} from './services/resource-suggestions';
export type { ResourceSuggestionContext } from './services/resource-suggestions';
export {
  QUESTION_BANK_MAX_ATTEMPTS,
  QUESTION_BANK_PASSAGE_LIMIT,
  QUESTION_BANK_PROMPT_ID,
  QUESTION_BANK_PROMPT_VERSION,
  enqueueCourseQuestionBanks,
  prepareQuestionBank,
  processQuestionBankJobs,
  requestQuestionBank,
} from './services/question-bank';
export type {
  QuestionBankCandidate,
  QuestionBankContext,
  QuestionBankDeps,
  QuestionBankGenerationInput,
  QuestionBankGenerator,
  QuestionBankPassage,
  QuestionBankProcessResult,
  QuestionBankStore,
} from './services/question-bank';
export { CADRAGE_DONE_FALLBACK, CADRAGE_MAX_QUESTIONS, CadrageTurnSchema } from './cadrage/schema';
export type {
  CadrageDone,
  CadrageObjective,
  CadrageQuestion,
  CadrageQuestionKey,
  CadrageSuggestion,
  CadrageTurn,
} from './cadrage/schema';
export { applyTutorTurn } from './cadrage/apply-tutor-turn';
export type {
  AppliedTutorTurn,
  ApplyTutorTurnConstraints,
  CadrageProfile,
} from './cadrage/apply-tutor-turn';
export { buildCadragePrompt, CADRAGE_PROMPT_ID } from './cadrage/prompt';
export type { BuiltCadragePrompt, CadrageHistoryEntry, CadragePromptInput } from './cadrage/prompt';
export { cadrageScenario } from './cadrage/scenario';
export type { CadrageScenario } from './cadrage/scenario';
export { runCadrageTurn } from './cadrage/run';
export type { CadrageRunContext, CadrageTutorState, CadrageTurnResult } from './cadrage/run';
export { PROGRAMME_PROMPT_ID, buildProgrammePrompt } from './programme/prompt';
export type { ProgrammePromptInput } from './programme/prompt';
export { PROGRAMME_DRAFT_SCHEMA, PROGRAMME_MAX_CORRECTIONS } from './programme/schema';
export type { ProgrammeDraftOutput } from './programme/schema';
export { programmeScenario } from './programme/scenario';
export type { ProgrammeOperation, ProgrammeScenario } from './programme/scenario';
export { programmeRunFailed, runProgrammeDraft } from './programme/run';
export type { ProgrammeDraftResult, ProgrammeRunContext, ProgrammeRunState } from './programme/run';
export { COURSE_MAX_CORRECTIONS, COURSE_PROMPT_ID, buildCoursePrompt } from './course/prompt';
export type { CoursePromptInput, CoursePromptNotion } from './course/prompt';
export { courseRunFailed, replaceCoursePlaceholders, runCourseChapter } from './course/run';
export type { CourseChapterResult, CourseRunContext } from './course/run';
export { citationFailureSummary, validateCourseCitations } from './course/citations';
export type {
  CitationIssue,
  CitationIssueCode,
  CitationValidation,
  KnownChunk,
  ResolvedCitation,
} from './course/citations';
export { generateCourseForModule } from './course/generate';
export type {
  CourseGenerationContext,
  CourseGenerationDeps,
  CourseGenerationEvents,
  CourseGenerationResult,
} from './course/generate';
