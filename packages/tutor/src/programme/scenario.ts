// Deterministic scenario key of the simulated programme task (SPEC-605, ADR-0048, ADR-0153).
// The live model ignores this value. In `LLM_MODE=mock`, it selects a committed fixture from the
// operation and the formation title; explicit test titles carry a marker word so a special
// sequence never depends on learner content.

export type ProgrammeScenario =
  'programme-sap' | 'programme-adjust' | 'programme-import' | 'programme-invalid';

export type ProgrammeOperation = 'generate' | 'adjust' | 'import';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function programmeScenario(
  operation: ProgrammeOperation,
  title: string,
  detail = '',
): ProgrammeScenario {
  const marker = normalize(`${title} ${detail}`);
  if (marker.includes('invalide') || marker.includes('invalid')) return 'programme-invalid';
  if (operation === 'adjust') return 'programme-adjust';
  if (operation === 'import') return 'programme-import';
  if (marker.includes('import')) return 'programme-import';
  return 'programme-sap';
}
