// Sigil of a formation (ADR-0162, SPEC-603 ET-6). The stored `monogram` wins; otherwise the two
// first alphanumeric characters of the title, without accents and in capitals, identify the
// formation on every screen. The function is pure so the seed, the services and the tests agree.

/** Longest accepted sigil (ADR-0162). */
export const FORMATION_MONOGRAM_MAX_LENGTH = 3;

export interface FormationMonogramInput {
  readonly title: string;
  /** Stored sigil; an empty string falls back to the computed two letters. */
  readonly monogram?: string | null;
}

/** ADR-0162 fallback: two first alphanumeric characters, without accents, in capitals. */
export function formationMonogram(title: string, monogram?: string | null): string {
  const stored = monogram?.trim() ?? '';
  if (stored !== '') return stored.slice(0, FORMATION_MONOGRAM_MAX_LENGTH);
  const folded = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return folded.slice(0, 2) === '' ? '?' : folded.slice(0, 2);
}

export type FormationAccentValue = 'indigo' | 'green' | 'orange' | 'violet' | 'teal';

/** ADR-0162 — next unused accent of the palette, `indigo` when all five are taken. */
export function nextFormationAccent(used: readonly FormationAccentValue[]): FormationAccentValue {
  const palette: readonly FormationAccentValue[] = ['indigo', 'green', 'orange', 'violet', 'teal'];
  return palette.find((accent) => !used.includes(accent)) ?? 'indigo';
}
