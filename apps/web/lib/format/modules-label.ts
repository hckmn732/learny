// Header pill of the global quiz (SPEC-701 EF-3): the module positions covered by the session.
// A single module is named as is; from two modules on, the pill says they are interleaved.

export function modulesLabel(positions: readonly number[]): string {
  const sorted = [...new Set(positions)].filter((position) => position > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return `Module ${String(sorted[0])}`;
  if (sorted.length === 2) return `Modules ${String(sorted[0])} et ${String(sorted[1])} mêlés`;
  const head = sorted
    .slice(0, -1)
    .map((position) => String(position))
    .join(', ');
  return `Modules ${head} et ${String(sorted[sorted.length - 1])} mêlés`;
}
