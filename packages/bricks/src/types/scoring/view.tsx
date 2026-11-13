'use client';

import { resolveLabels } from '../../view/labels';
import type { BrickViewProps } from '../../view-types';

/** Activity scale: total, weights and threshold (SPEC-503 EF-14). */
export function ScoringView({ brick, labels }: BrickViewProps<'scoring'>) {
  const t = resolveLabels(labels);
  const payload = brick.publicPayload;
  return (
    <section className="flex flex-col gap-10 text-ink" data-testid="brick-scoring">
      <h2 className="m-0 text-16 font-700">{t.scoringTitle(payload.total)}</h2>
      <ul className="m-0 flex list-disc flex-col gap-6 pl-18 text-14 leading-1.45 text-ink-secondary">
        {payload.weights.map((weight, index) => (
          <li key={weight.brickId}>
            {`Élément ${String(index + 1)} · ${String(weight.points)} pts`}
          </li>
        ))}
      </ul>
      <p className="m-0 text-12 text-ink-muted">{t.scoringThreshold(payload.threshold)}</p>
      <p className="m-0 text-12 text-ink-muted">{t.scoringHintPenalty}</p>
    </section>
  );
}
