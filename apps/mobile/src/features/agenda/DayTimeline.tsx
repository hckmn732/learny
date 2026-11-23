// Timeline of the day (SPEC-3203 EF-3, BR-AGE-07, CA-1).
//
// The activities of one civil day, in the order of their start minute, with the line of the
// current hour (13:20 in the mockup) drawn where the learner is now: between the slots that
// surround it, or after the last one. The line only appears on the current day of the learner.
import { StyleSheet, View } from 'react-native';

import type { AgendaSlot } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Text } from '../../ui/Text';

import { isOpenable } from './open-target';
import { formatMinuteOfDay } from './period';
import { slotBadgeOf, type SlotClock } from './slot-status';
import { SlotCard } from './SlotCard';

export interface DayTimelineProps {
  readonly slots: readonly AgendaSlot[];
  readonly clock: SlotClock;
  /** True when the displayed day is the current day of the learner (BR-AGE-07). */
  readonly showNow: boolean;
  readonly selectedId: string | null;
  readonly onSelect: (slot: AgendaSlot) => void;
  readonly onOpen: (slot: AgendaSlot) => void;
}

/** Line of the current hour, with the minute read in the zone of the learner. */
function NowLine({ minutes }: { readonly minutes: number }) {
  return (
    <View testID="agenda-now-line" style={styles.nowRow}>
      <Text variant="caption" tone="primary" style={styles.nowTime}>
        {formatMinuteOfDay(minutes)}
      </Text>
      <View style={styles.nowDot} />
      <View style={styles.nowBar} />
      <Text variant="caption" tone="muted">
        {fr.mobile.agenda.now}
      </Text>
    </View>
  );
}

/** Activities of the day, with the hour line of the current day. */
export function DayTimeline({
  slots,
  clock,
  showNow,
  selectedId,
  onSelect,
  onOpen,
}: DayTimelineProps) {
  const ordered = [...slots].sort((left, right) => left.startMinutes - right.startMinutes);
  const nowIndex = ordered.findIndex((slot) => slot.startMinutes > clock.nowMinutes);
  const nowPosition = showNow ? (nowIndex === -1 ? ordered.length : nowIndex) : -1;

  return (
    <View testID="agenda-timeline" style={styles.timeline}>
      {ordered.map((slot, index) => (
        <View key={slot.id}>
          {index === nowPosition ? <NowLine minutes={clock.nowMinutes} /> : null}
          <SlotCard
            slot={slot}
            badge={slotBadgeOf(slot, clock)}
            selected={slot.id === selectedId}
            openable={isOpenable(slot)}
            onSelect={() => {
              onSelect(slot);
            }}
            onOpen={() => {
              onOpen(slot);
            }}
          />
        </View>
      ))}
      {nowPosition === ordered.length && ordered.length > 0 ? (
        <NowLine minutes={clock.nowMinutes} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { gap: 0 },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.sm,
  },
  nowTime: { flexBasis: 44, fontVariant: ['tabular-nums'] },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.orange,
  },
  nowBar: { flex: 1, height: 1, backgroundColor: theme.colors.orange },
});
