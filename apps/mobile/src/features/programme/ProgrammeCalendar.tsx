// Calendar view of the Programme tab (SPEC-3202 EF-6; BR-FOR-05, BR-FOR-07).
//
// Month grid of the mockup `states/ios-programme-calendrier.png`: Monday first, the days outside
// the formation muted, a dot on every quiz day, today in an ink square with a lime number, the
// legend « Séance / Aujourd’hui », then the next session card that opens the quiz on the web
// (SPEC-3304 is not delivered yet, ADR-3002 § 3).
import { StyleSheet, View } from 'react-native';

import type { ProgrammeCalendarEntryDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Text } from '../../ui/Text';

import { calendarGrid, calendarWeeks, formatDayMonth, formatRange } from './view-model';
import type { ModuleView } from './view-model';

const t = fr.mobile.programme;

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

export interface ProgrammeCalendarProps {
  readonly calendar: readonly ProgrammeCalendarEntryDto[];
  readonly modules: readonly ModuleView[];
  readonly today: string;
  readonly start: string | null;
  readonly end: string | null;
  readonly onQuiz: (module: ModuleView) => void;
}

/** Weekly grid and next session of the formation. */
export function ProgrammeCalendar({
  calendar,
  modules,
  today,
  start,
  end,
  onQuiz,
}: ProgrammeCalendarProps) {
  const weeks = calendarWeeks(calendar, today);
  const grid = calendarGrid(calendar, today);
  const currentWeek = weeks.find((week) => week.current) ?? null;
  const next = [...calendar]
    .filter((entry) => entry.quizOn >= today)
    .sort((left, right) => left.quizOn.localeCompare(right.quizOn))[0];
  const nextModule =
    next === undefined ? null : (modules.find((module) => module.id === next.moduleId) ?? null);

  return (
    <View testID="programme-calendar" style={styles.base}>
      <View style={styles.head}>
        <Text variant="sectionTitle" style={styles.grow}>
          {t.calendar.title}
        </Text>
        <Text variant="caption" tone="muted">
          {formatRange(start, end)}
        </Text>
      </View>

      <Card>
        <View style={styles.weekdays}>
          {WEEKDAYS.map((day, index) => (
            <Text
              key={`${day}-${String(index)}`}
              variant="caption"
              tone="muted"
              align="center"
              style={styles.cell}
            >
              {day}
            </Text>
          ))}
        </View>
        {grid.map((week) => (
          <View key={week[0]?.day ?? ''} style={styles.week}>
            {week.map((day) => (
              <View key={day.day} style={styles.cell}>
                <View style={[styles.dayChip, day.today ? styles.dayToday : null]}>
                  <Text
                    variant="body"
                    tone={day.today ? 'limeInk' : day.inFormation ? 'primary' : 'muted'}
                    {...(day.today ? { testID: 'programme-calendar-today' } : {})}
                  >
                    {String(day.number)}
                  </Text>
                </View>
                {day.session ? <View style={styles.dot} /> : null}
              </View>
            ))}
          </View>
        ))}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={styles.dot} />
            <Text variant="caption" tone="muted">
              {t.calendar.sessionsLegend}
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.dot, styles.dotToday]} />
            <Text variant="caption" tone="muted">
              {t.calendar.todayLegend}
            </Text>
          </View>
        </View>
      </Card>

      {currentWeek === null ? null : (
        <Text variant="caption" tone="muted">
          {currentWeek.label}
        </Text>
      )}

      {next === undefined || nextModule === null ? (
        <Text variant="rowSubtitle" tone="muted">
          {t.calendar.empty}
        </Text>
      ) : (
        <Card testID="programme-next-session">
          <View style={styles.line}>
            <Text variant="eyebrow" tone="muted">
              {t.calendar.nextSession}
            </Text>
            <Text variant="caption" tone="muted">
              {next.quizOn === today ? t.calendar.todayChip : formatDayMonth(next.quizOn)}
            </Text>
          </View>
          <Text variant="sectionTitle">
            {next.quizKind === 'exam' ? t.module.exam : t.module.quiz} ·{' '}
            {t.calendar.moduleLabel(next.position, next.title)}
          </Text>
          <View style={styles.nextAction}>
            <Button
              label={t.calendar.openQuiz}
              variant="ink"
              size="sm"
              onPress={() => {
                onQuiz(nextModule);
              }}
              testID="programme-next-session-quiz"
            />
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { gap: theme.spacing.md },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  weekdays: { flexDirection: 'row', marginBottom: theme.spacing.sm },
  week: { flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: theme.spacing.xs },
  dayChip: {
    minWidth: 30,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
  },
  dayToday: { backgroundColor: theme.colors.ink },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.indigo },
  dotToday: { backgroundColor: theme.colors.ink },
  legend: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm },
  nextAction: { alignSelf: 'flex-start', marginTop: theme.spacing.md },
});
