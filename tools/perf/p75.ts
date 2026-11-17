// Percentile au rang le plus proche (ADR-0202, SPEC-804 EF-2).
// p75 de n valeurs = valeur de rang ceil(0.75 × n) dans la liste triée (4ᵉ sur 5).
export function percentileNearestRank(values: readonly number[], p: number): number {
  if (values.length === 0)
    throw new Error('percentileNearestRank : au moins une valeur est attendue');
  if (!Number.isFinite(p) || p < 0 || p > 1) {
    throw new Error('percentileNearestRank : la fraction doit être comprise entre 0 et 1');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil(p * sorted.length));
  const value = sorted[rank - 1];
  if (value === undefined) throw new Error('percentileNearestRank : rang hors limites');
  return value;
}
