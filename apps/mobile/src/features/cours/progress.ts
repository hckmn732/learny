// Reading progress of a chapter (SPEC-3302 ET-1, ET-2, BR-COU-08; CL-1).
//
// The server owns the percentage: the screen only reports the sections that were really visible
// (`CourseProgressUpdate`), at most once every ten seconds and once more when the learner leaves
// (BR-COU-08). The local percentage is an estimate that animates the bar between two answers and
// never goes back. Offline, the last snapshot of a chapter waits in a queue - one entry per chapter,
// the last value wins - and is replayed when the network returns (CL-1).
//
// Pure module: no React Native, no API, and its clock is injected, so the debounce is testable.
// `src/data/course.ts` owns the calls; this module owns the rules.

/** One send per ten seconds at most (BR-COU-08, ET-1). */
export const PROGRESS_DEBOUNCE_MS = 10_000;

/** Longest list of sections the contract accepts (`CourseProgressUpdate.visibleSectionIds`). */
export const MAX_VISIBLE_SECTIONS = 200;

/** Clamps a percentage into the 0-100 range of the contract, rounding it. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Union of the visible sections, in the order they were first seen, without duplicates. */
export function appendVisible(current: readonly string[], incoming: readonly string[]): string[] {
  const next = [...current];
  for (const id of incoming) {
    if (id !== '' && !next.includes(id) && next.length < MAX_VISIBLE_SECTIONS) next.push(id);
  }
  return next;
}

/** Local estimate of the chapter: share of its sections that were visible, 0-100 (ET-1). */
export function localChapterPercent(sectionCount: number, visibleCount: number): number {
  if (sectionCount <= 0) return 0;
  const bounded = Math.min(sectionCount, Math.max(0, visibleCount));
  return clampPercent((bounded / sectionCount) * 100);
}

/** Confirmed and estimated percentages merged: reading never makes the bar go back (BR-COU-08). */
export function readingPercent(confirmed: number, local: number): number {
  return Math.max(clampPercent(confirmed), clampPercent(local));
}

export interface ProgressIntent {
  readonly courseId: string;
  readonly chapterId: string;
  readonly visibleSectionIds: readonly string[];
}

/** Identity of a queued chapter: one entry per chapter, never two (CL-1). */
export function intentKey(intent: Pick<ProgressIntent, 'courseId' | 'chapterId'>): string {
  return `${intent.courseId}:${intent.chapterId}`;
}

/** Progress snapshots waiting for the network (CL-1), kept in the resident memory of the process. */
export class ProgressQueue {
  private readonly items = new Map<string, ProgressIntent>();

  /** Stores the newest snapshot of a chapter, replacing the previous one (last value wins). */
  enqueue(intent: ProgressIntent): number {
    this.items.set(intentKey(intent), {
      courseId: intent.courseId,
      chapterId: intent.chapterId,
      visibleSectionIds: [...intent.visibleSectionIds],
    });
    return this.items.size;
  }

  /** Snapshots to replay, oldest first. */
  values(): ProgressIntent[] {
    return [...this.items.values()];
  }

  /** Forgets a chapter once its snapshot was accepted by the server. */
  resolve(intent: Pick<ProgressIntent, 'courseId' | 'chapterId'>): void {
    this.items.delete(intentKey(intent));
  }

  size(): number {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }
}

/** Queue of the application (one per process, emptied on sign-out by SPEC-3003). */
export const pendingProgress = new ProgressQueue();

/**
 * Tracker of one chapter of one course: which sections were visible, the local percentage and the
 * debounce of the sends (ET-1, ET-2). `now` returns milliseconds, from the application clock.
 */
export class ReadingTracker {
  private visible: string[] = [];
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private changed = false;

  constructor(
    private readonly now: () => number,
    private readonly sectionCount: number,
    private readonly debounceMs: number = PROGRESS_DEBOUNCE_MS,
  ) {}

  /** Records the sections seen in the viewport; a section is never removed (BR-COU-08). */
  observe(visibleSectionIds: readonly string[]): void {
    const next = appendVisible(this.visible, visibleSectionIds);
    if (next.length === this.visible.length) return;
    this.visible = next;
    this.changed = true;
  }

  /** Sections seen so far, in reading order. */
  get ids(): readonly string[] {
    return this.visible;
  }

  /** Local estimate of the chapter (0-100). */
  get percent(): number {
    return localChapterPercent(this.sectionCount, this.visible.length);
  }

  /** True when a snapshot has not been accepted yet. */
  get pending(): boolean {
    return this.changed;
  }

  /** True when the snapshot may be sent: something changed and ten seconds elapsed (ET-1). */
  due(): boolean {
    if (!this.changed) return false;
    return this.now() - this.lastSentAt >= this.debounceMs;
  }

  /** Marks the snapshot accepted: the next change starts a new debounce window. */
  sent(): void {
    this.changed = false;
    this.lastSentAt = this.now();
  }
}
