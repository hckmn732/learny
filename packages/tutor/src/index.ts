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
