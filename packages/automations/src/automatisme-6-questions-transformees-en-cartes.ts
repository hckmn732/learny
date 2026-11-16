// SPEC-717 public entry point: the definition lives next to the other automations, as required
// by ADR-0190 (`definitions/<key>.ts`); this module keeps the file name announced by the spec.
export {
  explainQuestionsCartes,
  questionCardDedupeKey,
  questionCardSkipReason,
  questionsCartesAutomation,
} from './definitions/questions-cartes';
