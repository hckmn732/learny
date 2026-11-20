// Public surface of the personal-model qualification (SPEC-506 ET-1). The battery is executed by
// `@learny/llm`; the caller injects the thirteen brick schemas so `llm` never imports `bricks`.
export { evaluateQualification, runQualification } from './run';
export type {
  EvaluateQualificationInput,
  QualificationBrickBattery,
  QualificationSession,
  RunQualificationInput,
} from './run';
export {
  isQualificationScenario,
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_SCENARIOS,
  QUALIFICATION_FIXTURES,
  QUALIFICATION_SCENARIOS,
} from './fixtures';
export type { CompatibilityScenario, QualificationScenario } from './fixtures';
export { compatibilityCapabilities, evaluateTaskCompatibility } from './compatibility';
export type { CompatibilitySession, EvaluateTaskCompatibilityInput } from './compatibility';
