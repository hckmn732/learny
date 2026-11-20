import {
  exerciseDetail,
  exerciseHint,
  exerciseSaveDraft,
  exerciseStart,
  exerciseSubmit,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  getPracticeExercise,
  requestExerciseHint,
  saveExerciseDraft,
  startExerciseAttempt,
  submitExercise,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `exercises` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const exercisesImplementations = {
  exerciseSaveDraft: ({ ctx, params, body }: HandlerArgs<typeof exerciseSaveDraft>) =>
    saveExerciseDraft(ctx, params.aid, body.submission),
  exerciseSubmit: ({ ctx, params, body }: HandlerArgs<typeof exerciseSubmit>) =>
    submitExercise(ctx, params.aid, body.submission),
  exerciseDetail: ({ ctx, params }: HandlerArgs<typeof exerciseDetail>) =>
    getPracticeExercise(ctx, {
      formationId: params.fid,
      moduleId: params.mid,
      exerciseId: params.aid,
    }),
  exerciseStart: ({ ctx, params }: HandlerArgs<typeof exerciseStart>) =>
    startExerciseAttempt(ctx, { exerciseId: params.aid, moduleId: params.mid }),
  exerciseHint: ({ ctx, params }: HandlerArgs<typeof exerciseHint>) =>
    requestExerciseHint(ctx, { exerciseId: params.aid, moduleId: params.mid }),
};
