import type { AttemptHistoryEntry } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { fr } from '../../messages/fr';

const t = fr.quiz;
/** The mockup shows at most the six latest attempts (SPEC-612 EF-2). */
export const HISTORY_MAX = 6;

export function AttemptHistory({
  history,
  threshold,
}: {
  history: readonly AttemptHistoryEntry[];
  threshold: number;
}) {
  const shown = history.slice(-HISTORY_MAX);
  const label = shown
    .map(
      (entry) =>
        `${t.resultHistoryItem(entry.attemptNo, Math.round(entry.score))} ${t.resultHistoryItemSuffix(entry.passed)}`,
    )
    .join(' ; ');

  return (
    <div
      className="flex min-w-[220px] flex-[0_1_220px] flex-col gap-8"
      data-testid="result-history"
    >
      <span className="text-12 font-700 uppercase tracking-[0.08em] text-ink-muted">
        {t.resultHistoryTitle}
      </span>
      <div
        aria-hidden="true"
        className="relative flex h-120 items-end gap-14 border-b border-border"
      >
        <div
          className="absolute inset-x-0 border-t-2 border-dashed border-ink"
          style={{ bottom: `${String(threshold * 1.2)}px` }}
        />
        {shown.map((entry) => (
          <div
            className="w-44 rounded-t-10"
            data-testid="result-history-bar"
            key={entry.attemptNo}
            style={{
              height: `${String(Math.round(entry.score * 1.2))}px`,
              background: entry.passed ? colors.indigo : colors['orange-soft'],
              boxShadow: entry.passed ? undefined : `inset 0 0 0 2px ${colors.orange}`,
            }}
          />
        ))}
      </div>
      <div className="flex gap-14">
        {shown.map((entry) => (
          <span
            className="w-44 text-center text-12 tabular-nums text-ink-muted"
            key={entry.attemptNo}
          >
            <strong className="block text-ink">{`${String(Math.round(entry.score))} %`}</strong>
            {`T${String(entry.attemptNo)}`}
          </span>
        ))}
      </div>
      <ul className="sr-only" data-testid="result-history-alt">
        <li>{label}</li>
      </ul>
    </div>
  );
}
