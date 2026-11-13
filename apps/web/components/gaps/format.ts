/** Human module range of the statistics labels (SPEC-615 EF-1, BR-LAC-05). */
export function moduleRangeLabel(positions: readonly number[]): string | null {
  const unique = [...new Set(positions)].sort((left, right) => left - right);
  if (unique.length === 0) return null;
  if (unique.length === 1) return `module ${String(unique[0])}`;
  if (unique.length === 2) return `modules ${String(unique[0])} et ${String(unique[1])}`;
  const consecutive = unique.every(
    (position, index) => index === 0 || position === (unique[index - 1] ?? position) + 1,
  );
  if (consecutive) return `modules ${String(unique[0])} à ${String(unique.at(-1))}`;
  const head = unique.slice(0, -1).join(', ');
  return `modules ${head} et ${String(unique.at(-1))}`;
}

const NUMERIC = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** French percentage of the mastery line, without a trailing `,00`. */
export function formatPercent(value: number): string {
  return NUMERIC.format(value);
}

function civilDay(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * EF-1 — next review of the statistics: the time alone when it happens today in the learner's
 * zone, a short dated label otherwise. `generatedAt` comes from the service clock (ADR-0047), so
 * the page never calls the ambient clock.
 */
export function formatNextReview(
  nextReviewAt: string | null,
  generatedAt: string,
  timeZone: string,
  labels: { now: string; none: string },
): string {
  if (nextReviewAt === null) return labels.none;
  const instant = new Date(nextReviewAt);
  const now = new Date(generatedAt);
  if (civilDay(instant, timeZone) === civilDay(now, timeZone)) {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
  }
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/** Short dated label used when a gap carries no evidence text. */
export function formatDetectedAt(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(instant));
}
