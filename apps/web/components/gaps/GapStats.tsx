import type { GapListDto } from '@learny/contracts';
import { StatCard, StatRow } from '@learny/ui';

import { fr } from '../../messages/fr';

import { formatNextReview, moduleRangeLabel } from './format';

const t = fr.gaps;

export interface GapStatsProps {
  summary: GapListDto['summary'];
  nextReviewAt: string | null;
  generatedAt: string;
  timezone: string;
}

/**
 * Three statistics of SCR-13 (EF-1): open gaps, mastered notions and next review. The dark card
 * is the first one, like the mockup; labels stay textual so the figures never rely on colour.
 */
export function GapStats({ summary, nextReviewAt, generatedAt, timezone }: GapStatsProps) {
  const gapModules = moduleRangeLabel(summary.gapModules);
  const masteredModules = moduleRangeLabel(summary.masteredModules);
  return (
    <StatRow data-testid="gaps-summary">
      <StatCard
        data-testid="gaps-stat-open"
        style={{ flexBasis: 'auto' }}
        tone="dark"
        value={t.stats.notionCount(summary.openGaps)}
        label={t.stats.openLabel(gapModules)}
      />
      <StatCard
        data-testid="gaps-stat-mastered"
        style={{ flexBasis: 'auto' }}
        value={t.stats.notionCount(summary.masteredNotions)}
        label={t.stats.masteredLabel(masteredModules)}
      />
      <StatCard
        data-testid="gaps-stat-next"
        style={{ flexBasis: 'auto' }}
        value={formatNextReview(nextReviewAt, generatedAt, timezone, {
          now: t.stats.nextNow,
          none: t.stats.nextNone,
        })}
        label={t.stats.nextLabel}
      />
    </StatRow>
  );
}
