// Practice exercise services (SPEC-613): tutor generation, production validation, grading and the
// attempt lifecycle of SCR-08.
export {
  requestExerciseHint,
  saveExerciseDraft,
  startExerciseAttempt,
  submitExercise,
} from './attempt-service';
export type { ExercisePageDto } from './attempt-service';
export { ensurePracticeExercise } from './ensure-practice-exercise';
export type { EnsuredPracticeExercise } from './ensure-practice-exercise';
export { getPracticeExercise } from './get-practice-exercise';
export type { GetPracticeExerciseInput } from './get-practice-exercise';
export { gradeExercise, mockTutor, normalizeTutorCorrection } from './grade-exercise';
export type {
  ExerciseTutor,
  GradeExerciseError,
  GradeExerciseOptions,
  NormalizedTutorCorrection,
  TutorCorrection,
  TutorCriterionScore,
} from './grade-exercise';
export { validateProduction } from './validate-production';
export type { ProductionIssue, ProductionValidation } from './validate-production';
