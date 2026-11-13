// Public API of @learny/tutor (SPEC-512; completed by SPEC-508).
export { SEARCH_WEB_TOOL_NAME, guardSearchWeb, searchWeb, searchWebTool } from './tools/search-web';
export type { SearchWebContext, SearchWebSecrets } from './tools/search-web';
export { TUTOR_TOOLS, toolAllowedForTask } from './tools/index';
export type { TutorToolName } from './tools/index';
export { isTutorTask, TUTOR_TASKS, WEB_SEARCH_TASKS } from './tasks';
export type { TutorTask } from './tasks';
export {
  decideResourceSuggestion,
  listResourceSuggestions,
  suggestResource,
} from './services/resource-suggestions';
export type { ResourceSuggestionContext } from './services/resource-suggestions';
export type { TutorTool } from './tools/tool';
