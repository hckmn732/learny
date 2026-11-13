// Public API of @learny/tutor (SPEC-508): the ten actions, the deterministic loop and the prompt
// builder. Model providers and provider SDKs are never imported here.
export { runTutor } from './loop';
export type { RunTutorRequest } from './loop';
export {
  buildTutorPrompt,
  createTutorContext,
  escapeTutorData,
  PROMPT_VERSIONS,
} from './context';
export type { BuiltTutorPrompt, CreateTutorContextOptions, TutorContext, TutorLlmSession } from './context';
export {
  TUTOR_TOOLS,
  toolDefinitions,
  toolNames,
  tutorToolByName,
  createDbNotifier,
  createDbToolRuntime,
  READ_RESOURCES_TOKEN_BUDGET,
} from './tools/index';
export type {
  TutorTool,
  ToolContext,
  ToolScope,
  TutorNotifier,
  TutorToolRuntime,
  WebSearchPort,
  QuestionBankPort,
} from './tools/index';
export * from './tools/schemas';
export type {
  TutorActionInfo,
  TutorDocument,
  TutorInput,
  TutorProfile,
  TutorRunResult,
  TutorTask,
  TutorToolCall,
  TutorTone,
} from '@learny/contracts';
