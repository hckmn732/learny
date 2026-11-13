import type { FinalReviewDto } from '@learny/contracts';
import { formatDuration } from '@learny/services/home/derive';
import { StatCard, StatRow } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.finalReview;

export interface FinalReviewStatsProps {
  stats: FinalReviewDto['stats'];
  retention: FinalReviewDto['retention'];
}

/**
 * Four statistics of SCR-16 (SPEC-617 EF-1, CA-3): acquisitions, fragile notions, hours actually
 * worked and one-month retention. The first card is the dark one, like the « Lacunes » mockup;
 * the retention card prints « Pas encore disponible » instead of a misleading 0 %.
 */
export function FinalReviewStats({ stats, retention }: FinalReviewStatsProps) {
  return (
    <StatRow data-testid="final-review-stats">
      <StatCard
        data-testid="final-review-stat-mastered"
        style={{ flexBasis: 'auto' }}
        tone="dark"
        value={t.stats.mastered(stats.masteredNotions)}
        label={t.stats.masteredLabel(stats.totalNotions)}
      />
      <StatCard
        data-testid="final-review-stat-gaps"
        style={{ flexBasis: 'auto' }}
        value={t.stats.gaps(stats.fragileNotions)}
        label={t.stats.gapsLabel}
      />
      <StatCard
        data-testid="final-review-stat-hours"
        style={{ flexBasis: 'auto' }}
        value={t.stats.hours(formatDuration(stats.completedMinutes))}
        label={t.stats.hoursLabel}
      />
      <StatCard
        data-testid="final-review-stat-retention"
        style={{ flexBasis: 'auto' }}
        value={t.stats.retention(retention.oneMonth)}
        label={`${t.stats.retentionLabel} · ${t.stats.retentionTwoMonths(retention.twoMonths)}`}
      />
    </StatRow>
  );
}
