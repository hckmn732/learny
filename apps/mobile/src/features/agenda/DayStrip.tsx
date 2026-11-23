// Strip of the days of the week (SPEC-3203 EF-2, BR-AGE-07, CA-2).
//
// The mockup's Monday-to-Sunday strip: the initial of the day, its number and one dot per
// activity; the selected day is drawn in ink with a lime number. A press opens that day in the
// day view (BR-AGE-07), a horizontal swipe goes to the previous or next period (EF-9).
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { civilDayLong, civilDayNumber } from '../../lib/dates';
import { theme, verticalHitSlop } from '../../theme';
import { Text } from '../../ui/Text';

import { daysOfWeek } from './period';

/** Monday-first initials of the mockup. */
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

export interface DayStripProps {
  /** Day selected in the day view; its week is the one displayed. */
  readonly day: string;
  /** Number of activities per civil day, for the dots. */
  readonly counts: Readonly<Record<string, number>>;
  readonly onSelectDay: (day: string) => void;
  readonly testID?: string;
}

/** Strip of the seven days of the week of `day`. */
export function DayStrip({ day, counts, onSelectDay, testID = 'agenda-day-strip' }: DayStripProps) {
  const t = fr.mobile.agenda;
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={t.weekDaysLabel}
      style={styles.strip}
    >
      {daysOfWeek(day).map((current, index) => {
        const count = counts[current] ?? 0;
        const selected = current === day;
        return (
          <Pressable
            key={current}
            testID={`agenda-day-${current}`}
            accessibilityRole="tab"
            accessibilityLabel={t.dayLabel(civilDayLong(current), count)}
            accessibilityState={{ selected }}
            onPress={() => {
              onSelectDay(current);
            }}
            hitSlop={{ top: verticalHitSlop(theme.controls.chip) }}
            style={styles.day}
          >
            <Text variant="caption" tone="muted">
              {DAY_LETTERS[index] ?? ''}
            </Text>
            <View style={[styles.number, selected ? styles.numberSelected : null]}>
              <Text variant="label" tone={selected ? 'limeInk' : 'primary'}>
                {String(civilDayNumber(current))}
              </Text>
            </View>
            <View style={styles.dots}>
              {Array.from({ length: Math.min(count, 2) }, (_unused, dot) => (
                <View key={dot} style={[styles.dot, selected ? styles.dotSelected : null]} />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  day: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.option,
  },
  number: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  numberSelected: { backgroundColor: theme.colors.ink },
  dots: { flexDirection: 'row', gap: 2, height: 4 },
  dot: {
    width: 3,
    height: 3,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigo,
  },
  dotSelected: { backgroundColor: theme.colors.limeInk },
});
