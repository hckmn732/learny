import {
  chapterComplete,
  moduleGenerateCourse,
  moduleScreen,
  resourcesRename,
  resourcesRetry,
  suggestionsDismiss,
  suggestionsImport,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  completeChapter,
  dismissSuggestion,
  generateCourseNow,
  getModuleScreen,
  importSuggestion,
  renameResource,
  retryResource,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `resources` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const resourcesImplementations = {
  chapterComplete: ({ ctx, params, body }: HandlerArgs<typeof chapterComplete>) =>
    completeChapter(ctx, params.cid, body),
  moduleGenerateCourse: ({ ctx, params }: HandlerArgs<typeof moduleGenerateCourse>) =>
    generateCourseNow(ctx, params.mid),
  moduleScreen: ({ ctx, params, query }: HandlerArgs<typeof moduleScreen>) =>
    getModuleScreen(ctx, params.mid, query.chapitre),
  suggestionsDismiss: ({ ctx, params }: HandlerArgs<typeof suggestionsDismiss>) =>
    dismissSuggestion(ctx, params.rid),
  suggestionsImport: ({ ctx, params }: HandlerArgs<typeof suggestionsImport>) =>
    importSuggestion(ctx, params.rid),
  resourcesRetry: ({ ctx, params }: HandlerArgs<typeof resourcesRetry>) =>
    retryResource(ctx, params.rid),
  resourcesRename: ({ ctx, params, body }: HandlerArgs<typeof resourcesRename>) =>
    renameResource(ctx, params.rid, body),
};
