// Pure choice of the game imposed by a detected gap (SPEC-716 EF-3, EF-6; BR-AUT-05, ADR-0020).
//
// `chooseGapFormat` maps the nature of the gap to one format: a confusion alternates association
// and categorization for the same pair, a forgetting asks for a recall card, an application and a
// misunderstanding impose no quiz format (the exercise is scheduled by the automation). When a
// confrontation brick is missing the caller still imposes a choice question carrying the confused
// notion as a distractor and flags `pendingGeneration` until the bank delivers the brick.
//
// `weightedFormatPick` is the deterministic, weighted draw of the learner preference: `cards`
// gives the recall card a weight of three, `matching` gives association and categorization a
// weight of three, `vary` leaves every format equiprobable. The last played format is never drawn
// again when another candidate exists (BR-MEM-04).
import { createSeededRandom } from '../random';
import type { BrickFormat, GapNature } from '../types';

export interface ChooseGapFormatInput {
  readonly nature: GapNature;
  /** Format of the last confrontation played for the same pair, if any (EF-3 alternation). */
  readonly lastPairFormat?: BrickFormat | null;
  /** Formats available in the learner's bank for the notion(s). */
  readonly available: readonly BrickFormat[];
}

export interface GapFormatChoice {
  /** The imposed format, or `null` when the gap imposes none. */
  readonly format: BrickFormat | null;
  /** CL-9 — a confrontation brick is being generated for the pair. */
  readonly pendingGeneration: boolean;
}

const CONFRONTATION_FORMATS: readonly BrickFormat[] = ['matching', 'categorization'];

function has(available: readonly BrickFormat[], format: BrickFormat): boolean {
  return available.includes(format);
}

/** EF-3 — the format imposed by the nature of a gap. Never reads the clock or the bank. */
export function chooseGapFormat(input: ChooseGapFormatInput): GapFormatChoice {
  switch (input.nature) {
    case 'forgetting':
      return {
        format: has(input.available, 'recall_card') ? 'recall_card' : null,
        pendingGeneration: false,
      };
    case 'confusion': {
      const availablePair = CONFRONTATION_FORMATS.filter((format) => has(input.available, format));
      if (availablePair.length > 0) {
        const preferred: BrickFormat =
          input.lastPairFormat === 'categorization' ? 'matching' : 'categorization';
        const format = availablePair.includes(preferred) ? preferred : (availablePair[0] ?? null);
        return { format, pendingGeneration: false };
      }
      // CL-9 — no confrontation brick: a choice question with the confused notion as distractor.
      if (has(input.available, 'choice_question')) {
        return { format: 'choice_question', pendingGeneration: true };
      }
      return { format: null, pendingGeneration: true };
    }
    case 'application':
    case 'misunderstanding':
      return { format: null, pendingGeneration: false };
  }
}

export interface WeightedFormatPickInput {
  readonly preference: 'vary' | 'cards' | 'matching' | 'matching_categorization';
  readonly available: readonly BrickFormat[];
  readonly lastFormat?: BrickFormat | null;
  /** Deterministic seed, e.g. `hash(userId, date)` (EF-6). */
  readonly seed: string;
}

function weightOf(preference: WeightedFormatPickInput['preference'], format: BrickFormat): number {
  if (preference === 'cards' && format === 'recall_card') return 3;
  if (
    (preference === 'matching' || preference === 'matching_categorization') &&
    CONFRONTATION_FORMATS.includes(format)
  ) {
    return 3;
  }
  return 1;
}

/** EF-6 — deterministic weighted draw; never the last format when another candidate exists. */
export function weightedFormatPick(input: WeightedFormatPickInput): BrickFormat | null {
  const all = [...new Set(input.available)];
  if (all.length === 0) return null;
  const candidates =
    input.lastFormat !== undefined && input.lastFormat !== null && all.length > 1
      ? all.filter((format) => format !== input.lastFormat)
      : all;
  const ordered = [...candidates].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const total = ordered.reduce((sum, format) => sum + weightOf(input.preference, format), 0);
  if (total <= 0) return ordered[0] ?? null;
  const random = createSeededRandom(input.seed);
  let ticket = random() * total;
  for (const format of ordered) {
    ticket -= weightOf(input.preference, format);
    if (ticket < 0) return format;
  }
  return ordered[ordered.length - 1] ?? null;
}
