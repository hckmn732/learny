// Month view of the agenda (SPEC-3203 EF-5, BR-AGE-01, CA-2).
//
// Six Monday-first weeks as the mockup draws them: the greyed days of the neighbouring months,
// the days of the month with a dot as soon as they carry an activity, the selected day in ink.
// A press opens the day view of that day (BR-AGE-07); the legend recalls the two dot colours.
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { civilDayLong } from '../../lib/dates';
import { theme, verticalHitSlop } from '../../theme';
import { Text } from '../../ui/Text';

import { monthCells } from './period';

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
/** One seventh of the width, written once: the grid never divides inside a style. */
const CELL_WIDTH = '14.2857%' as const;

export interface MonthGridProps {
  readonly day: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly onSelectDay: (day: string) => void;
}

/** Grid of the month of `day`. */
export function MonthGrid({ day, counts, onSelectDay }: MonthGridProps) {
  const t = fr.mobile.agenda;
  const cells = monthCells(day);

  return (
    <View testID="agenda-month-grid">
      <View style={styles.head}>
        {DAY_LETTERS.map((letter, index) => (
          <Text
            key={`${letter}-${String(index)}`}
            variant="caption"
            tone="muted"
            align="center"
            style={styles.cell}
          >
            {letter}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell) => {
          const count = counts[cell.day] ?? 0;
          const selected = cell.day === day;
          if (!cell.inMonth) {
            return (
              <View key={cell.day} style={styles.cell}>
                <Text variant="caption" tone="muted" align="center" style={styles.muted}>
                  {String(cell.number)}
                </Text>
              </View>
            );
          }
          return (
            <Pressable
              key={cell.day}
              testID={`agenda-month-${cell.day}`}
              accessibilityRole="button"
              accessibilityLabel={t.dayLabel(civilDayLong(cell.day), count)}
              accessibilityState={{ selected }}
              onPress={() => {
                onSelectDay(cell.day);
              }}
              hitSlop={{ top: verticalHitSlop(40) }}
              style={styles.cell}
            >
              <View
                style={[
                  styles.day,
                  selected ? styles.daySelected : null,
                  count > 0 && !selected ? styles.dayMarked : null,
                ]}
              >
                <Text variant="caption" tone={selected ? 'limeInk' : 'primary'}>
                  {String(cell.number)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotActivity]} />
          <Text variant="caption" tone="muted">
            {t.monthLegendActivity}
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.dotSelection]} />
          <Text variant="caption" tone="muted">
            {t.monthLegendSelection}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', marginBottom: theme.spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_WIDTH, alignItems: 'center', paddingVertical: theme.spacing.xs },
  muted: { opacity: 0.45 },
  day: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  daySelected: { backgroundColor: theme.colors.ink },
  dayMarked: { borderWidth: 1, borderColor: theme.colors.indigo },
  legend: { flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  legendDot: { width: 6, height: 6, borderRadius: theme.radius.pill },
  dotActivity: { backgroundColor: theme.colors.indigo },
  dotSelection: { backgroundColor: theme.colors.ink },
});
