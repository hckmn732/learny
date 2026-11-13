// Deterministic scenario key of the simulated cadrage (SPEC-604 ET-5, ADR-0048, ADR-0153).
//
// The live model ignores this value. In `LLM_MODE=mock`, it selects a committed fixture from the
// formation title and the number of learner answers already stored: the same formation always
// replays the same sequence, and no learner content chooses the fixture (the title is never sent
// as an instruction). Tests that need a special sequence use a title carrying its marker word.

export type CadrageScenario =
  | 'cadrage-sap-q1'
  | 'cadrage-sap-q2'
  | 'cadrage-sap-q3'
  | 'cadrage-sap-q4'
  | 'cadrage-sap-q5'
  | 'cadrage-sap-done'
  | 'cadrage-sixth-question'
  | 'cadrage-invalid'
  | 'cadrage-injection';

const SAP_SEQUENCE: readonly CadrageScenario[] = [
  'cadrage-sap-q1',
  'cadrage-sap-q2',
  'cadrage-sap-q3',
  'cadrage-sap-q4',
  'cadrage-sap-q5',
  'cadrage-sap-done',
];

function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** `learnerAnswers` is 0 before the first learner answer, 5 after the fifth one. */
export function cadrageScenario(title: string, learnerAnswers: number): CadrageScenario {
  const normalized = normalizeTitle(title);
  if (normalized.includes('sixieme') || normalized.includes('sixth')) {
    return 'cadrage-sixth-question';
  }
  if (normalized.includes('invalide') || normalized.includes('invalid')) {
    return 'cadrage-invalid';
  }
  if (normalized.includes('injection')) {
    return 'cadrage-injection';
  }
  const index = Math.min(Math.max(0, learnerAnswers), SAP_SEQUENCE.length - 1);
  return SAP_SEQUENCE[index] ?? 'cadrage-sap-done';
}
