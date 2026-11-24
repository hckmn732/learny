// State of the Réviser tab (SPEC-3305 EF-1 to EF-4, ET-2; BR-MEM-02, BR-MEM-08).
//
// Pure functions only: the rail, the progress label, the end detection and the fourteen cells of
// the streak are derived from the server DTO, never recomputed by the screen. The current game is a
// local position: the server decides the order and the states.
import type { GlobalQuizSessionDto, ReviewItemDto, ReviewSummaryDto } from '@learny/contracts';
import { ReviewSummaryDtoSchema } from '@learny/contracts';

/** Status of one game in the rail (BR-MEM-08): played, being played, still to come. */
export type RailStatus = 'done' | 'current' | 'upcoming';

export interface RailEntry {
  readonly position: number;
  readonly label: string;
  readonly type: string;
  readonly status: RailStatus;
}

/** Rail of the session, one entry per game, in the order of the server (EF-2). */
export function railOf(items: readonly ReviewItemDto[], current: number): RailEntry[] {
  return items.map((item) => ({
    position: item.position,
    label: item.displayLabel,
    type: item.type,
    status: item.state !== 'todo' ? 'done' : item.position === current ? 'current' : 'upcoming',
  }));
}

/** Index of a position in the item list (0 when the position is unknown). */
export function indexOfPosition(items: readonly ReviewItemDto[], position: number): number {
  const index = items.findIndex((item) => item.position === position);
  return index < 0 ? 0 : index;
}

/** Game at a position, or the first game of the session. */
export function itemAt(items: readonly ReviewItemDto[], position: number): ReviewItemDto | null {
  return items[indexOfPosition(items, position)] ?? null;
}

/** True when the position is the last game of the session. */
export function isLastItem(items: readonly ReviewItemDto[], position: number): boolean {
  return items.length > 0 && indexOfPosition(items, position) === items.length - 1;
}

/** Position of the next game, or `null` at the end of the session. */
export function nextPositionOf(items: readonly ReviewItemDto[], position: number): number | null {
  const index = indexOfPosition(items, position);
  return items[index + 1]?.position ?? null;
}

/** First game that is still to play (the position the server resumes at), or the first one. */
export function startPositionOf(items: readonly ReviewItemDto[]): number {
  return (items.find((item) => item.state === 'todo') ?? items[0])?.position ?? 0;
}

export interface Progress {
  /** 1-based game shown, capped to the number of games. */
  readonly current: number;
  /** Notions of the day, as counted by the server (EF-1: « Notion 4 sur 14 »). */
  readonly total: number;
  readonly minutes: number;
  readonly ratio: number;
}

/** Header progress of the session (EF-1). */
export function progressOf(
  session: Pick<GlobalQuizSessionDto, 'header'>,
  items: readonly ReviewItemDto[],
  position: number,
): Progress {
  const index = indexOfPosition(items, position);
  const current = Math.min(index + 1, Math.max(items.length, 1));
  const total = Math.max(session.header.notionCount, items.length, 1);
  return {
    current,
    total,
    minutes: session.header.estimatedMinutes,
    ratio: Math.min(1, current / total),
  };
}

/** Summary of the session once the server closed it (EF-4); tolerant of an absent or invalid one. */
export function summaryOf(
  session: Pick<GlobalQuizSessionDto, 'summary'> | null | undefined,
): ReviewSummaryDto | null {
  if (session === null || session === undefined) return null;
  const parsed = ReviewSummaryDtoSchema.safeParse(session.summary);
  return parsed.success ? parsed.data : null;
}

/** True when the end screen replaces the game area (EF-4, CL-1). */
export function isEnded(
  session: Pick<GlobalQuizSessionDto, 'status' | 'summary'> | null | undefined,
): boolean {
  if (session === null || session === undefined) return false;
  return session.status === 'completed' || summaryOf(session) !== null;
}

/** Cells of « Série de N jours » over the last fourteen days (BR-GAM-02). */
export function streakCells(streakDays: number, total = 14): readonly boolean[] {
  const lit = Math.min(Math.max(streakDays, 0), total);
  return Array.from({ length: total }, (_, index) => index >= total - lit);
}

/** True when the item accepts an answer (a withdrawn or already answered game is read-only). */
export function canAnswer(item: ReviewItemDto | null): boolean {
  return item !== null && item.state === 'todo';
}

/** True when the item is a game the code corrects (the recall card is self-assessed). */
export function isSelfAssessed(item: ReviewItemDto | null): boolean {
  return item?.type === 'recall_card';
}
