import {
  confirmExamFormatRoute,
  getExamAttempt,
  getExamIntro,
  getExamResult,
  markExamQuestion,
  saveExamAnswer,
  startExamAttempt,
  submitExamAttempt,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  confirmExamFormat,
  getExamAttempt as getExamAttemptService,
  getExamIntro as getExamIntroService,
  getExamResult as getExamResultService,
  markExamQuestion as markExamQuestionService,
  saveExamAnswer as saveExamAnswerService,
  startExamAttempt as startExamAttemptService,
  submitExam,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `mock-exams` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const mockExamsImplementations = {
  startExamAttempt: async ({ ctx, params }: HandlerArgs<typeof startExamAttempt>) => {
    const result = await startExamAttemptService(ctx, params.fid);
    if (!result.ok) return result;
    if (result.value.resumed === true) {
      return Response.json(result.value, { status: 200 });
    }
    return result;
  },
  confirmExamFormatRoute: ({ ctx, params }: HandlerArgs<typeof confirmExamFormatRoute>) =>
    confirmExamFormat(ctx, params.fid),
  getExamIntro: ({ ctx, params }: HandlerArgs<typeof getExamIntro>) =>
    getExamIntroService(ctx, params.fid),
  saveExamAnswer: ({ ctx, params, body }: HandlerArgs<typeof saveExamAnswer>) =>
    saveExamAnswerService(ctx, params.aid, params.pos, body),
  markExamQuestion: ({ ctx, params, body }: HandlerArgs<typeof markExamQuestion>) =>
    markExamQuestionService(ctx, params.aid, params.pos, body.marked),
  getExamResult: ({ ctx, params }: HandlerArgs<typeof getExamResult>) =>
    getExamResultService(ctx, params.aid),
  getExamAttempt: ({ ctx, params }: HandlerArgs<typeof getExamAttempt>) =>
    getExamAttemptService(ctx, params.aid),
  submitExamAttempt: async ({ ctx, params }: HandlerArgs<typeof submitExamAttempt>) => {
    const result = await submitExam(ctx, params.aid, { trigger: 'manual' });
    if (!result.ok) return result;
    return {
      status: result.value.status,
      unansweredCount: result.value.unansweredCount,
      markedCount: result.value.markedCount,
    };
  },
};
