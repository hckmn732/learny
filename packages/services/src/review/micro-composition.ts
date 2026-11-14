import { MICRO_SESSION_COMPOSITION } from '@learny/config/product';

// Composition of the micro-session (SPEC-703 EF-2, ET-2, ET-3; BR-AUT-02, ADR-0182).
//
// Pure and deterministic: the service ranks the due notions with the daily-session engine, then
// this module builds the short session — one recall card (two when D = 10) on the most urgent
// notions, then one question covering up to four other priority notions. A format is kept only
// when an unseen variant exists; without a question variant the session keeps its cards and the
// missing format is returned for the refill request (CL-2). Nothing here touches the database.

/** Question formats of the micro-session, in the preference order of ADR-0182 §2. */
export const MICRO_QUESTION_FORMATS = [
  'cloze',
  'matching',
  'categorization',
  'choice_question',
] as const;

export type MicroQuestionFormat = (typeof MICRO_QUESTION_FORMATS)[number];

/** One active brick variant the composition may serve (payload already resolved). */
export interface MicroBrick {
  brickId: string;
  brickVersionId: string;
  type: string;
  notionIds: string[];
  displayLabel: string;
  moduleIds: string[];
  /** Gap reason of the first notion (« Choisi pour votre oubli »), when any. */
  reasonKey: string | null;
  /** BR-MEM-07 — a variant already answered is never served twice. */
  fingerprint: string | null;
}

export interface ComposeMicroInput {
  durationMin: number;
  /** ET-3 — false until SPEC-702 delivers the four playable games. */
  gamesEnabled: boolean;
  /** Due notions ranked by priority (gap first, then delay): the engine order. */
  priorityNotionIds: readonly string[];
  bricks: readonly MicroBrick[];
  seenFingerprints: ReadonlySet<string>;
}

export interface MicroComposition {
  items: MicroBrick[];
  cardCount: number;
  hasQuestion: boolean;
  /** Formats with no unseen variant: the caller asks SPEC-513 for a refill (CL-2). */
  missingFormats: string[];
}

/** EF-2 — number of recall cards of a D-minute micro-session (ADR-0182 §1). */
export function microCardCount(durationMin: number): number {
  const composition = (
    MICRO_SESSION_COMPOSITION as Readonly<Record<number, { cards: number } | undefined>>
  )[durationMin];
  return composition?.cards ?? 1;
}

function isSeen(brick: MicroBrick, seenFingerprints: ReadonlySet<string>): boolean {
  return brick.fingerprint !== null && seenFingerprints.has(brick.fingerprint);
}

/**
 * EF-2, ET-3, CL-1 to CL-3 — builds the items of the micro-session from the ranked due notions.
 * The cards go first, on the most urgent notion that still has an unseen card variant; the
 * question is a multinotion game covering up to four priority notions, else a choice question.
 */
export function composeMicroSession(input: ComposeMicroInput): MicroComposition {
  const priority = [...new Set(input.priorityNotionIds)];
  const priorityIndex = new Map(priority.map((notionId, index) => [notionId, index]));
  const prioritySet = new Set(priority);
  const used = new Set<string>();
  const covered = new Set<string>();
  const items: MicroBrick[] = [];

  const available = (brick: MicroBrick): boolean =>
    !used.has(brick.brickId) &&
    brick.notionIds.every((notionId) => prioritySet.has(notionId)) &&
    !isSeen(brick, input.seenFingerprints);

  const cardWanted = microCardCount(input.durationMin);
  for (const notionId of priority) {
    if (items.length >= cardWanted) break;
    if (covered.has(notionId)) continue;
    const candidate = input.bricks
      .filter((brick) => brick.type === 'recall_card' && brick.notionIds.includes(notionId))
      .filter(available)
      .sort(
        (left, right) =>
          left.notionIds.length - right.notionIds.length ||
          left.brickId.localeCompare(right.brickId),
      )[0];
    if (candidate === undefined) continue;
    used.add(candidate.brickId);
    for (const served of candidate.notionIds) covered.add(served);
    items.push(candidate);
  }
  const cardCount = items.length;

  const preferredFormats: readonly MicroQuestionFormat[] = input.gamesEnabled
    ? MICRO_QUESTION_FORMATS
    : ['choice_question'];

  let question: MicroBrick | undefined;
  for (const format of preferredFormats) {
    question = input.bricks
      .filter((brick) => brick.type === format)
      .filter(available)
      .filter((brick) => brick.notionIds.length <= 4)
      .filter((brick) => brick.notionIds.some((notionId) => !covered.has(notionId)))
      .sort((left, right) => {
        const rank = (brick: MicroBrick): number =>
          Math.min(
            ...brick.notionIds.map(
              (notionId) => priorityIndex.get(notionId) ?? Number.MAX_SAFE_INTEGER,
            ),
          );
        return (
          right.notionIds.length - left.notionIds.length ||
          rank(left) - rank(right) ||
          left.brickId.localeCompare(right.brickId)
        );
      })[0];
    if (question !== undefined) break;
  }

  if (question !== undefined) {
    used.add(question.brickId);
    items.push(question);
  }

  return {
    items,
    cardCount,
    hasQuestion: question !== undefined,
    missingFormats:
      question === undefined && preferredFormats.length > 0 ? [preferredFormats[0] as string] : [],
  };
}
