// One activity of the day timeline (SPEC-3203 EF-3, BR-AGE-02, BR-AGE-04, CA-1).
//
// Time on the left, the rail with its dot, then the card: title, status chip, detail and the
// « Ouvrir » link of the openable activities. The imminent activity is the ink card with a lime
// link (mockup 13:20, contrast kept as ADR-3003 § 3 requires), the next one carries the lime dot.
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import type { AgendaSlot } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme, verticalHitSlop } from '../../theme';
import { Chip, type ChipTone } from '../../ui/Chip';
import { Text } from '../../ui/Text';

import { formatMinuteOfDay } from './period';
import { slotEmphasis, type SlotBadge } from './slot-status';

const CHIP_TONES: Record<SlotBadge['kind'], ChipTone> = {
  done: 'green',
  todo: 'lime',
  soon: 'lime',
  upcoming: 'outline',
  missed: 'orange',
};

export interface SlotCardProps {
  readonly slot: AgendaSlot;
  readonly badge: SlotBadge;
  readonly selected: boolean;
  /** True when the « Ouvrir » link is drawn (EF-3, EF-6). */
  readonly openable: boolean;
  readonly onSelect: () => void;
  readonly onOpen: () => void;
}

/** Status label of a badge, in the words of BR-AGE-04. */
export function badgeLabel(badge: SlotBadge): string {
  const status = fr.mobile.agenda.status;
  if (badge.kind === 'done') return status.done;
  if (badge.kind === 'todo') return status.todo;
  if (badge.kind === 'soon') return status.soon(badge.minutes ?? 0);
  if (badge.kind === 'missed') return status.missed;
  return status.upcoming;
}

/** Card of one activity. */
export function SlotCard({ slot, badge, selected, openable, onSelect, onOpen }: SlotCardProps) {
  const emphasis = slotEmphasis(badge);
  const ink = emphasis === 'now';
  const time = formatMinuteOfDay(slot.startMinutes);
  const label = badgeLabel(badge);
  const dotColor =
    badge.kind === 'soon'
      ? theme.colors.orange
      : badge.kind === 'todo'
        ? theme.colors.limeInk
        : theme.colors.indigo;

  return (
    <View style={styles.row}>
      <Text variant="caption" tone="muted" style={styles.time}>
        {time}
      </Text>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.line} />
      </View>
      <Pressable
        testID={`slot-${slot.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${slot.title}, ${slot.typeLabel}, ${time}, ${label}`}
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={[
          styles.card,
          ink ? styles.cardInk : null,
          selected && !ink ? styles.cardSelected : null,
        ]}
      >
        <View style={styles.head}>
          <Text
            variant="rowTitle"
            tone={ink ? 'inverse' : 'primary'}
            numberOfLines={2}
            style={styles.title}
          >
            {slot.title}
          </Text>
          <Chip label={label} tone={CHIP_TONES[badge.kind]} />
        </View>
        {slot.meta === null ? null : (
          <Text variant="rowSubtitle" tone={ink ? 'onDarkSecondary' : 'muted'} numberOfLines={2}>
            {slot.meta}
          </Text>
        )}
        {openable ? (
          <Pressable
            testID={`slot-open-${slot.id}`}
            accessibilityRole="link"
            accessibilityLabel={fr.agenda.open}
            onPress={(event: GestureResponderEvent) => {
              event.stopPropagation();
              onOpen();
            }}
            hitSlop={verticalHitSlop(theme.controls.chip)}
            style={styles.link}
          >
            <Text variant="buttonSmall" tone={ink ? 'limeInk' : 'primary'}>
              {fr.agenda.open}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  time: {
    flexBasis: 44,
    paddingTop: theme.spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  rail: { width: 12, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    marginTop: theme.spacing.xl,
    borderRadius: theme.radius.pill,
  },
  line: {
    flex: 1,
    width: 1,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.border,
  },
  card: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.option,
    backgroundColor: theme.colors.surface,
  },
  cardInk: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  cardSelected: { borderColor: theme.colors.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { flexShrink: 1 },
  link: { alignSelf: 'flex-start', marginTop: theme.spacing.xs },
});
