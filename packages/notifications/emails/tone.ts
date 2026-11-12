// Tutor tone of the e-mail copy (ADR-0010): every sentence addressed to the learner exists in two
// variants. Fixed interface labels stay in the `vous` form; the e-mails are tutor messages, so
// they follow the tone of the profile.
export const TONES = ['vous', 'tu'] as const;
export type Tone = (typeof TONES)[number];

export interface ToneVariants {
  vous: string;
  tu: string;
}

/** Picks the variant of the tone; identical variants may be written once with `same()`. */
export function t(tone: Tone, variants: ToneVariants): string {
  return tone === 'tu' ? variants.tu : variants.vous;
}

/** A sentence that does not change with the tone. */
export function same(text: string): ToneVariants {
  return { vous: text, tu: text };
}

export function isTone(value: unknown): value is Tone {
  return value === 'vous' || value === 'tu';
}
