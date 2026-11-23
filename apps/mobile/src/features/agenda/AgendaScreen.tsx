// Agenda — day, week and month views of the learner (SPEC-3203).
//
// EF-1 header (long date, title, legend), EF-2 segmented control and day strip, EF-3 timeline,
// EF-4 week list, EF-5 month grid, EF-6 « Ouvrir », EF-7 replanning, EF-8 empty filter, EF-9
// horizontal swipe; BR-AGE-01 to BR-AGE-07 and CA-1 to CA-4.
//
// The screen holds three pieces of state — view, day and formation — mirrored in the URL
// (`/agenda?vue=jour&date=2026-11-11&formation=all`, ET-2) for the deep links, exactly as the web
// does. The periods, the statuses and every destination come from the server; the screen only
// formats them in the zone of the learner and reads the time through `clock.now()` (ADR-0047).
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { AgendaSlot } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { useAgenda } from '../../data/use-agenda';
import { clock } from '../../lib/clock';
import { civilDayLong, civilDayMonth, civilMonthYear, FALLBACK_TIME_ZONE } from '../../lib/dates';
import { useOnlineStatus } from '../../offline/network';
import { theme, verticalHitSlop } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';

import { DayStrip } from './DayStrip';
import { DayTimeline } from './DayTimeline';
import { ALL_FORMATIONS, FormationFilterSheet } from './FormationFilterSheet';
import { LegendSheet } from './LegendSheet';
import { MonthGrid } from './MonthGrid';
import { openSlot } from './open-target';
import {
  canShift,
  clampDay,
  formatMinutes,
  formatMinuteOfDay,
  isAgendaView,
  minutesOfDay,
  periodOf,
  shiftPeriod,
  todayOf,
  type AgendaView,
  type CivilPeriod,
} from './period';
import { ReplanSheet } from './ReplanSheet';
import { SelectedActivityCard } from './SelectedActivityCard';
import { slotBadgeOf, slotEmphasis, type SlotClock } from './slot-status';
import { WeekList } from './WeekList';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function viewOf(value: string | undefined): AgendaView {
  return isAgendaView(value) ? value : 'jour';
}

function dayOfParam(value: string | undefined): string | null {
  return value !== undefined && DAY_PATTERN.test(value) ? value : null;
}

/** Long label of the displayed period, in the words of the header. */
function periodLabelOf(view: AgendaView, day: string): string {
  const t = fr.mobile.agenda;
  if (view === 'jour') return civilDayLong(day);
  if (view === 'semaine') {
    const week = periodOf('semaine', day);
    return t.weekRange(civilDayMonth(week.from), civilDayMonth(week.to));
  }
  return t.monthCaption(civilMonthYear(day));
}

export interface AgendaScreenProps {
  /** Frozen instant of the component tests; the route reads `clock.now()` (ADR-0047). */
  readonly now?: Date;
}

/** Root screen of the Agenda tab. */
export function AgendaScreen({ now }: AgendaScreenProps = {}) {
  const t = fr.mobile.agenda;
  const instant = now ?? clock.now();
  const params: Record<string, string | string[] | undefined> = useLocalSearchParams();
  const router = useRouter();
  const online = useOnlineStatus();

  // ET-2 - the URL is the single source of the view, the day and the filter, as on the web: a
  // deep link lands on the state it names and every navigation writes it back (`goTo`).
  const view = viewOf(firstParam(params.vue));
  const day = dayOfParam(firstParam(params.date)) ?? todayOf(instant, FALLBACK_TIME_ZONE);
  const formation = firstParam(params.formation) ?? ALL_FORMATIONS;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [replanSlot, setReplanSlot] = useState<AgendaSlot | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const goTo = useCallback(
    (next: { readonly view?: AgendaView; readonly day?: string; readonly formation?: string }) => {
      const nextView = next.view ?? view;
      const nextDay = next.day ?? day;
      const nextFormation = next.formation ?? formation;
      router.setParams({ vue: nextView, date: nextDay, formation: nextFormation });
    },
    [day, formation, router, view],
  );

  const window = periodOf(view, day);
  const agenda = useAgenda({ from: window.from, to: window.to, formation });
  const data = agenda.data;
  const slots = useMemo(() => data?.slots ?? [], [data]);
  const bounds = useMemo<CivilPeriod | null>(
    () => (data?.bounds == null ? null : { from: data.bounds.start, to: data.bounds.end }),
    [data],
  );
  const timeZone = data?.timezone ?? FALLBACK_TIME_ZONE;
  const today = data?.today ?? todayOf(instant, timeZone);
  const nowMinutes = minutesOfDay(instant, timeZone);
  const clockOf = useMemo<SlotClock>(() => ({ today, nowMinutes }), [nowMinutes, today]);

  // CL-2 - a day outside the periods of the formations is displayed inside their bounds and the
  // previous/next controls of the header stay inactive there (`canShift`), without a second fetch.
  const currentDay = clampDay(day, bounds);
  const displayed = periodOf(view, currentDay);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const slot of slots) result[slot.date] = (result[slot.date] ?? 0) + 1;
    return result;
  }, [slots]);

  const daySlots = useMemo(
    () =>
      slots
        .filter((slot) => slot.date === currentDay)
        .sort((left, right) => left.startMinutes - right.startMinutes),
    [currentDay, slots],
  );

  const selectedSlot = useMemo(() => {
    const explicit = daySlots.find((slot) => slot.id === selectedId);
    if (explicit !== undefined) return explicit;
    const imminent = daySlots.find((slot) => slotEmphasis(slotBadgeOf(slot, clockOf)) === 'now');
    return imminent ?? daySlots[0] ?? null;
  }, [clockOf, daySlots, selectedId]);

  const formationLabel =
    formation === ALL_FORMATIONS
      ? t.filterAll
      : (data?.formations.find((item) => item.id === formation)?.title ?? t.filterAll);

  const canGoPrevious = canShift(view, currentDay, -1, bounds);
  const canGoNext = canShift(view, currentDay, 1, bounds);
  const onToday = today >= displayed.from && today <= displayed.to;

  const shift = useCallback(
    (direction: 1 | -1) => {
      if (!canShift(view, currentDay, direction, bounds)) return;
      goTo({ day: shiftPeriod(view, currentDay, direction) });
    },
    [bounds, currentDay, goTo, view],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 30 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 40) shift(-1);
          else if (gesture.dx < -40) shift(1);
        },
      }),
    [shift],
  );

  const openDay = useCallback(
    (next: string) => {
      setSelectedId(null);
      goTo({ view: 'jour', day: next });
    },
    [goTo],
  );

  const selectSlot = useCallback((slot: AgendaSlot) => {
    setSelectedId(slot.id);
  }, []);

  const openActivity = useCallback((slot: AgendaSlot) => {
    // EF-6 — the destination is the one the server computed (`href`); the P33 screens take over
    // as they land (see `open-target.ts`).
    void openSlot(slot).catch(() => undefined);
  }, []);

  const startReplan = useCallback(
    (slot: AgendaSlot) => {
      if (!online) {
        setToast(t.replanOffline);
        return;
      }
      if (!slot.movable) {
        setToast(t.replanSheet.notMovable);
        return;
      }
      setReplanSlot(slot);
    },
    [online, t.replanOffline, t.replanSheet.notMovable],
  );

  const onMoved = useCallback(
    (result: { readonly movedSlot: AgendaSlot }) => {
      setToast(t.movedToast);
      setReplanSlot(null);
      setSelectedId(result.movedSlot.id);
      goTo({ view: 'jour', day: result.movedSlot.date });
    },
    [goTo, t.movedToast],
  );

  const ready = agenda.status === 'ready';
  const empty = ready && slots.length === 0;

  return (
    <View style={styles.base} testID="agenda-screen" {...pan.panHandlers}>
      <View style={styles.header} testID="agenda-header">
        <View style={styles.headerTexts}>
          <View style={styles.eyebrowRow}>
            <Pressable
              testID="agenda-previous"
              accessibilityRole="button"
              accessibilityLabel={t.previousPeriod}
              accessibilityState={{ disabled: !canGoPrevious }}
              disabled={!canGoPrevious}
              onPress={() => {
                shift(-1);
              }}
              hitSlop={{ top: verticalHitSlop(20), bottom: verticalHitSlop(20) }}
              style={styles.chevron}
            >
              <Icon
                name="chevronLeft"
                size={16}
                color={canGoPrevious ? theme.colors.inkMuted : theme.colors.borderStrong}
              />
            </Pressable>
            <Text
              variant="eyebrow"
              tone="muted"
              numberOfLines={1}
              style={styles.eyebrow}
              testID="agenda-period-label"
            >
              {periodLabelOf(view, currentDay)}
            </Text>
            <Pressable
              testID="agenda-next"
              accessibilityRole="button"
              accessibilityLabel={t.nextPeriod}
              accessibilityState={{ disabled: !canGoNext }}
              disabled={!canGoNext}
              onPress={() => {
                shift(1);
              }}
              hitSlop={{ top: verticalHitSlop(20), bottom: verticalHitSlop(20) }}
              style={styles.chevron}
            >
              <Icon
                name="chevronRight"
                size={16}
                color={canGoNext ? theme.colors.inkMuted : theme.colors.borderStrong}
              />
            </Pressable>
            {onToday ? null : (
              <Pressable
                testID="agenda-today"
                accessibilityRole="button"
                accessibilityLabel={t.today}
                onPress={() => {
                  goTo({ day: today });
                }}
                hitSlop={theme.spacing.sm}
              >
                <Text variant="caption" tone="primary" style={styles.today}>
                  {t.today}
                </Text>
              </Pressable>
            )}
          </View>
          <Text variant="largeTitle">{fr.agenda.title}</Text>
        </View>
        <IconButton
          testID="agenda-legend-button"
          name="list"
          accessibilityLabel={t.legendAction}
          onPress={() => {
            setLegendOpen(true);
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          testID="agenda-filter"
          accessibilityRole="button"
          accessibilityLabel={`${t.filterLabel} : ${formationLabel}`}
          onPress={() => {
            setFilterOpen(true);
          }}
          hitSlop={verticalHitSlop(theme.controls.chip)}
          style={styles.filter}
        >
          <Icon name="layers" size={13} color={theme.colors.ink} />
          <Text variant="chip" style={styles.filterLabel} numberOfLines={1}>
            {formationLabel}
          </Text>
          <Icon name="chevronDown" size={12} color={theme.colors.inkMuted} />
        </Pressable>

        <Segmented
          options={[
            { value: 'jour', label: t.viewJour },
            { value: 'semaine', label: t.viewSemaine },
            { value: 'mois', label: t.viewMois },
          ]}
          value={view}
          onChange={(next) => {
            goTo({ view: isAgendaView(next) ? next : 'jour' });
          }}
          label={t.viewsLabel}
          testID="agenda-view"
        />

        {agenda.status === 'loading' ? (
          <View testID="agenda-loading" style={styles.skeleton}>
            <Skeleton animated={false} lines={2} />
            <Skeleton animated={false} height={56} />
            <Skeleton animated={false} height={56} />
          </View>
        ) : null}

        {agenda.status === 'error' ? (
          <ErrorState testID="agenda-error" title={t.loadError} onRetry={agenda.retry} />
        ) : null}

        {empty ? (
          <EmptyState
            testID="agenda-empty"
            icon="calendar"
            title={formation === ALL_FORMATIONS ? t.globalEmptyTitle : t.emptyTitle(formationLabel)}
            description={formation === ALL_FORMATIONS ? t.globalEmptyBody : t.emptyBody}
            action={{
              label: t.emptyAction,
              onPress: () => {
                setFilterOpen(true);
              },
            }}
          />
        ) : null}

        {ready && !empty && view === 'jour' ? (
          <>
            <DayStrip day={currentDay} counts={counts} onSelectDay={openDay} />
            {daySlots.length === 0 ? (
              <EmptyState testID="agenda-day-empty" icon="calendar" title={t.dayEmpty} />
            ) : (
              <DayTimeline
                slots={daySlots}
                clock={clockOf}
                showNow={currentDay === today}
                selectedId={selectedSlot?.id ?? null}
                onSelect={selectSlot}
                onOpen={openActivity}
              />
            )}
            <SelectedActivityCard
              slot={selectedSlot}
              badge={selectedSlot === null ? null : slotBadgeOf(selectedSlot, clockOf)}
              replanDisabled={!online || selectedSlot?.movable !== true}
              replanHint={online ? null : t.replanOffline}
              onOpen={() => {
                if (selectedSlot !== null) openActivity(selectedSlot);
              }}
              onReplan={() => {
                if (selectedSlot !== null) startReplan(selectedSlot);
              }}
            />
          </>
        ) : null}

        {ready && !empty && view === 'semaine' ? (
          <WeekList day={day} slots={slots} onSelectDay={openDay} />
        ) : null}

        {ready && !empty && view === 'mois' ? (
          <>
            <MonthGrid day={day} counts={counts} onSelectDay={openDay} />
            <Card style={styles.monthSummary} testID="agenda-month-summary">
              <View style={styles.monthHead}>
                <Text variant="caption" tone="muted">
                  {civilDayLong(currentDay)}
                </Text>
                <Chip label={t.monthCount(daySlots.length)} tone="indigo" />
              </View>
              <Text variant="rowSubtitle" tone="muted">
                {daySlots.length === 0
                  ? t.dayEmpty
                  : daySlots
                      .map((slot) => `${formatMinuteOfDay(slot.startMinutes)} ${slot.title}`)
                      .join(' · ')}
              </Text>
              <Button
                label={t.monthOpen}
                variant="ink"
                size="sm"
                onPress={() => {
                  openDay(currentDay);
                }}
                testID="agenda-month-open"
              />
            </Card>
          </>
        ) : null}

        {ready && data !== null && slots.length > 0 ? (
          <Card testID="agenda-totals" style={styles.totals}>
            <View style={styles.total}>
              <Text variant="figure">{formatMinutes(data.totals.plannedMinutes)}</Text>
              <Text variant="statLabel" tone="muted">
                {fr.agenda.plannedWord}
              </Text>
            </View>
            <View style={styles.total}>
              <Text variant="figure">{formatMinutes(data.totals.doneMinutes)}</Text>
              <Text variant="statLabel" tone="muted">
                {fr.agenda.doneWord}
              </Text>
            </View>
            <View style={styles.total}>
              <Text variant="rowSubtitle" tone="muted">
                {fr.agenda.marginsLabel(data.totals.marginsRemaining)}
              </Text>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.toast} pointerEvents="box-none">
        <Toast
          visible={toast !== null}
          message={toast ?? ''}
          onHide={() => {
            setToast(null);
          }}
          testID="agenda-toast"
        />
      </View>

      <FormationFilterSheet
        visible={filterOpen}
        formations={data?.formations ?? []}
        value={formation}
        onSelect={(next) => {
          setSelectedId(null);
          goTo({ formation: next });
        }}
        onClose={() => {
          setFilterOpen(false);
        }}
      />
      <LegendSheet
        visible={legendOpen}
        onClose={() => {
          setLegendOpen(false);
        }}
      />
      <ReplanSheet
        slot={replanSlot}
        visible={replanSlot !== null && online}
        online={online}
        onClose={() => {
          setReplanSlot(null);
        }}
        onMoved={onMoved}
        onConflict={() => {
          setToast(t.conflictToast);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: theme.colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  headerTexts: { flex: 1, minWidth: 0, gap: 2 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  eyebrow: { flexShrink: 1 },
  chevron: { alignItems: 'center', justifyContent: 'center' },
  today: { textDecorationLine: 'underline' },
  content: {
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
    maxWidth: '100%',
    minHeight: theme.controls.chip,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.chip,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  filterLabel: { flexShrink: 1 },
  skeleton: { gap: theme.spacing.sm },
  monthSummary: { gap: theme.spacing.sm },
  monthHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  totals: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.xl },
  total: { gap: 2 },
  toast: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: theme.spacing.xxl,
    alignItems: 'center',
  },
});
