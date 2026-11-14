import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

export interface SessionProgressProps {
  total: number;
  /** Zero-based index of the displayed game; `total` once the session is over. */
  currentIndex: number;
  finished?: boolean;
}

function segmentColor(index: number, currentIndex: number, finished: boolean): string {
  if (finished || index < currentIndex) return 'bg-ink';
  if (index === currentIndex) return 'bg-lime';
  return 'bg-border';
}

/**
 * SCR-10 §10.3 — segmented progress bar and its label (SPEC-701 EF-5). One segment per game,
 * dark for played games, lime for the current one, grey for the next ones.
 */
export function SessionProgress(props: SessionProgressProps) {
  const label = props.finished
    ? t.progress.done
    : t.progress.label(Math.min(props.currentIndex + 1, props.total), props.total);
  return (
    <div className="flex items-center gap-12">
      <div aria-hidden="true" className="flex flex-1 gap-6" data-testid="gq-progress">
        {Array.from({ length: props.total }, (_, index) => (
          <span
            className={`h-8 flex-1 rounded-4 ${segmentColor(index, props.currentIndex, props.finished === true)}`}
            key={index}
          />
        ))}
      </div>
      <span
        aria-label={
          props.finished
            ? t.progress.done
            : t.progress.aria(Math.min(props.currentIndex + 1, props.total), props.total)
        }
        className="text-14 font-600 tabular-nums text-ink"
        data-testid="gq-progress-label"
      >
        {label}
      </span>
    </div>
  );
}
