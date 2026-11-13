// Stable accent palette of a formation (ADR-0162, SPEC-603 ET-6). The same values drive the home
// table, the sidebar sigil and the progress ring so a formation keeps one identity on every screen.
export type FormationAccentToken = 'indigo' | 'green' | 'orange' | 'violet' | 'teal';

export interface FormationAccentColors {
  /** Sigil background. */
  readonly background: string;
  /** Sigil text. */
  readonly text: string;
  /** Progress ring arc. */
  readonly ring: string;
}

export const formationAccents: Readonly<Record<FormationAccentToken, FormationAccentColors>> = {
  indigo: { background: '#ECECFC', text: '#3A3AA8', ring: '#5B5BD6' },
  green: { background: '#E1F4EF', text: '#0F6B5A', ring: '#14A38B' },
  orange: { background: '#FFEDE0', text: '#A13A06', ring: '#F97316' },
  violet: { background: '#F0E9FE', text: '#5B21B6', ring: '#8B5CF6' },
  teal: { background: '#E1F4EF', text: '#0B5C4D', ring: '#0F9F7F' },
} as const;

/** Tailwind classes of a sigil, declared literally so the compiler keeps them. */
export const formationAccentClass: Readonly<Record<FormationAccentToken, string>> = {
  indigo: 'bg-indigo-soft text-indigo-ink',
  green: 'bg-green-soft text-green-ink-alt',
  orange: 'bg-orange-soft text-orange-ink-strong',
  violet: 'bg-violet-soft text-violet-ink',
  teal: 'bg-green-soft text-green-ink',
} as const;
