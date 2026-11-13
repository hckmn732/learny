/** EF-12 — « A », « A et B », « A, B et C ». */
export function formatFirstNames(names: readonly string[]): string {
  const clean = names.map((name) => name.trim()).filter((name) => name !== '');
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} et ${clean.at(-1) ?? ''}`;
}
