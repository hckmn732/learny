// Row of the three figures of Aujourd'hui (SPEC-3201 EF-4; BR-GAM-01/02, BR-MEM-06).
//
// « Série » in lime, « Rétention » and « Lacunes » on the surface tone, exactly as the mockup. Each
// card is a button that opens its fiche; a retention or a streak the server has not measured yet
// shows « — » (BR-MEM-06, SPEC-603 EF-3).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { StatCard } from '../../ui/StatCard';

const t = fr.mobile.today.stats;

export interface StatsRowProps {
  readonly streakDays: number | null;
  readonly retention: number | null;
  readonly gaps: number | null;
  readonly onPressStreak: () => void;
  readonly onPressRetention: () => void;
  readonly onPressGaps: () => void;
}

/** A figure with its optional unit: `exactOptionalPropertyTypes` forbids passing `undefined`. */
function figure(
  value: number | null,
  unit: (count: number) => string,
): {
  readonly value: string;
  readonly unit?: string;
} {
  if (value === null) return { value: '—' };
  return { value: String(value), unit: unit(value) };
}

/** EF-4 — the three stat cards, each one opening its detail sheet. */
export function StatsRow({
  streakDays,
  retention,
  gaps,
  onPressStreak,
  onPressRetention,
  onPressGaps,
}: StatsRowProps) {
  const streak = figure(streakDays, t.streakUnit);
  const measured = figure(retention, () => t.retentionUnit);
  const openGaps = figure(gaps, t.gapsUnit);

  return (
    <View style={styles.row} testID="today-stats">
      <StatCard
        testID="stat-streak"
        tone="lime"
        icon="flame"
        label={t.streak}
        value={streak.value}
        {...(streak.unit === undefined ? {} : { unit: streak.unit })}
        onPress={onPressStreak}
      />
      <StatCard
        testID="stat-retention"
        icon="target"
        label={t.retention}
        value={measured.value}
        {...(measured.unit === undefined ? {} : { unit: measured.unit })}
        onPress={onPressRetention}
      />
      <StatCard
        testID="stat-gaps"
        icon="alert"
        label={t.gaps}
        value={openGaps.value}
        {...(openGaps.unit === undefined ? {} : { unit: openGaps.unit })}
        onPress={onPressGaps}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.sm },
});
