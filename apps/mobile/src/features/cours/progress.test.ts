// Vitest [SPEC-3302] - reading progress of a chapter (CA-2, ET-1, ET-2, BR-COU-08; CL-1).
//
// The rules are pure: the clock is injected, so the ten-second debounce and the offline queue are
// proven without a device nor a network.
import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendVisible,
  clampPercent,
  intentKey,
  localChapterPercent,
  MAX_VISIBLE_SECTIONS,
  pendingProgress,
  PROGRESS_DEBOUNCE_MS,
  ProgressQueue,
  readingPercent,
  ReadingTracker,
} from './progress';

beforeEach(() => {
  pendingProgress.clear();
});

describe('[SPEC-3302] progression de lecture', () => {
  it('borne les pourcentages à 0-100 (BR-COU-08)', () => {
    expect(clampPercent(-20)).toBe(0);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(49.6)).toBe(50);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it('calcule le pourcentage local à partir des sections visibles (ET-1)', () => {
    expect(localChapterPercent(4, 0)).toBe(0);
    expect(localChapterPercent(4, 1)).toBe(25);
    expect(localChapterPercent(4, 2)).toBe(50);
    expect(localChapterPercent(4, 4)).toBe(100);
    // A chapter without sections never divides by zero.
    expect(localChapterPercent(0, 3)).toBe(0);
  });

  it('ne fait jamais reculer la barre entre valeur confirmée et estimation (BR-COU-08)', () => {
    expect(readingPercent(60, 25)).toBe(60);
    expect(readingPercent(25, 60)).toBe(60);
  });

  it('cumule les sections vues sans doublon et dans l’ordre de lecture (ET-2)', () => {
    const first = appendVisible([], ['a', 'b']);
    expect(first).toEqual(['a', 'b']);
    expect(appendVisible(first, ['b', 'c'])).toEqual(['a', 'b', 'c']);
    // The contract bounds the list at 200 identifiers.
    const many = Array.from(
      { length: MAX_VISIBLE_SECTIONS + 5 },
      (_, index) => `s-${String(index)}`,
    );
    expect(appendVisible([], many)).toHaveLength(MAX_VISIBLE_SECTIONS);
  });

  it('n’envoie qu’une fois par tranche de dix secondes (ET-1)', () => {
    let now = 1_000;
    const tracker = new ReadingTracker(() => now, 4);
    expect(tracker.due()).toBe(false);

    tracker.observe(['a']);
    expect(tracker.percent).toBe(25);
    expect(tracker.due()).toBe(true);
    tracker.sent();
    expect(tracker.pending).toBe(false);

    tracker.observe(['a', 'b']);
    expect(tracker.percent).toBe(50);
    expect(tracker.due()).toBe(false);

    now += PROGRESS_DEBOUNCE_MS - 1;
    expect(tracker.due()).toBe(false);
    now += 1;
    expect(tracker.due()).toBe(true);
    tracker.sent();

    // A second observation of a known section changes nothing: no useless write.
    tracker.observe(['a']);
    expect(tracker.pending).toBe(false);
    expect(tracker.due()).toBe(false);
  });

  it('garde la dernière valeur par chapitre hors ligne (CL-1)', () => {
    const queue = new ProgressQueue();
    const intent = { courseId: 'c1', chapterId: 'ch1', visibleSectionIds: ['s1'] };
    queue.enqueue(intent);
    queue.enqueue({ ...intent, visibleSectionIds: ['s1', 's2'] });
    expect(queue.size()).toBe(1);
    expect(queue.values()[0]?.visibleSectionIds).toEqual(['s1', 's2']);
    expect(intentKey(intent)).toBe('c1:ch1');

    queue.enqueue({ courseId: 'c1', chapterId: 'ch2', visibleSectionIds: ['s3'] });
    expect(queue.size()).toBe(2);
    queue.resolve(intent);
    expect(queue.size()).toBe(1);
    expect(queue.values()[0]?.chapterId).toBe('ch2');
    queue.clear();
    expect(queue.size()).toBe(0);
  });

  it('fige la photographie mise en file contre les mutations du tableau (CL-1)', () => {
    const queue = new ProgressQueue();
    const visible = ['s1'];
    queue.enqueue({ courseId: 'c1', chapterId: 'ch1', visibleSectionIds: visible });
    visible.push('s2');
    expect(queue.values()[0]?.visibleSectionIds).toEqual(['s1']);
  });
});
