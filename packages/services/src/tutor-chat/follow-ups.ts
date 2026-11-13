import type { FollowUpDto, FollowUpKey } from '@learny/contracts';

// SPEC-610 ET-6, EF-9 — the code computes the follow-ups, never the model. `rephrase`,
// `example` and `test_me` are always proposed; `compare` only when a confusion pair exists in the
// chapter. The follow-up just served is not proposed again (CL-3).

export interface ConfusionPair {
  left: string;
  right: string;
}

export interface FollowUpInput {
  confusion: ConfusionPair | null;
  /** Follow-up that produced the current answer, when any. */
  served?: FollowUpKey | undefined;
}

export const FOLLOW_UP_LABELS = {
  rephrase: 'Explique autrement',
  example: 'Un exemple concret',
  test_me: 'Teste-moi',
} as const;

/** `Clé de comptabilisation` → `Clé`; only the first segment is kept for a short comparison. */
export function shortNotion(label: string): string {
  return label.split(/\s+de\s+/i)[0]?.trim() ?? label;
}

export function compareLabel(pair: ConfusionPair): string {
  const right = pair.right.charAt(0).toLowerCase() + pair.right.slice(1);
  const label = `${shortNotion(pair.left)} ou ${right} ?`;
  return label.length > 32 ? `${label.slice(0, 29)}…` : label;
}

export function buildFollowUps(input: FollowUpInput): FollowUpDto[] {
  const entries: FollowUpDto[] = [
    { key: 'rephrase', label: FOLLOW_UP_LABELS.rephrase },
    { key: 'example', label: FOLLOW_UP_LABELS.example },
    ...(input.confusion === null
      ? []
      : [{ key: 'compare' as const, label: compareLabel(input.confusion) }]),
    { key: 'test_me', label: FOLLOW_UP_LABELS.test_me },
  ];
  return entries.filter((entry) => entry.key !== input.served);
}
