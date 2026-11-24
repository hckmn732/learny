// Week view of the agenda (SPEC-3203 EF-4, BR-AGE-07, CA-2).
//
// One row per day of the Monday-to-Sunday week: the weekday and its number, the first activity
// (its time and the number of activities of the day). A press opens the day view of that day.
import { Pressable, StyleSheet, View } from 'react-native';

import type { AgendaSlot } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { civilDayLong, civilDayNumber } from '../../lib/dates';
import { theme, verticalHitSlop } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

import { daysOfWeek, formatMinuteOfDay } from './period';

const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

export interface WeekListProps {
  readonly day: string;
  readonly slots: readonly AgendaSlot[];
  readonly onSelectDay: (day: string) => void;
}

/** One week of activities, Monday to Sunday. */
export function WeekList({ day, slots, onSelectDay }: WeekListProps) {
  const t = fr.mobile.agenda;

  return (
    <View testID="agenda-week-list" style={styles.list}>
      {daysOfWeek(day).map((current, index) => {
        const ofDay = slots
          .filter((slot) => slot.date === current)
          .sort((left, right) => left.startMinutes - right.startMinutes);
        const first = ofDay[0];
        const count = ofDay.length;
        return (
          <Pressable
            key={current}
            testID={`agenda-week-day-${current}`}
            accessibilityRole="button"
            accessibilityLabel={t.weekRowLabel(civilDayLong(current), count)}
            onPress={() => {
              onSelectDay(current);
            }}
            hitSlop={{ top: verticalHitSlop(theme.controls.row) }}
            style={styles.row}
          >
            <View style={styles.badge}>
              <Text variant="label" tone="muted">
                {DAY_LETTERS[index] ?? ''}
              </Text>
              <Text variant="rowTitle">{String(civilDayNumber(current))}</Text>
            </View>
            <View style={styles.body}>
              <Text variant="rowTitle" numberOfLines={1}>
                {first === undefined ? t.weekEmptyDay : first.title}
              </Text>
              <Text variant="rowSubtitle" tone="muted">
                {first === undefined
                  ? t.weekCount(0)
                  : `${t.weekCount(count)} · ${formatMinuteOfDay(first.startMinutes)}`}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={theme.colors.inkMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.list,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badge: { width: 32, alignItems: 'center' },
  body: { flex: 1, minWidth: 0, gap: 2 },
});
