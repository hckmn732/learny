// « Activité sélectionnée » of the day view (SPEC-3203 EF-3, BR-AGE-05, CA-1).
//
// Type, title, day, hour, detail, then the two actions of the mockup: « Ouvrir » (EF-6) and
// « Replanifier » (BR-AGE-05). Replanning stays disabled offline (CL-4) or as soon as the server
// no longer marks the slot as movable.
import { StyleSheet, View } from 'react-native';

import type { AgendaSlot } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { civilDayLong } from '../../lib/dates';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip, type ChipTone } from '../../ui/Chip';
import { Text } from '../../ui/Text';

import { formatMinuteOfDay } from './period';
import type { SlotBadge } from './slot-status';
import { badgeLabel } from './SlotCard';

const CHIP_TONES: Record<SlotBadge['kind'], ChipTone> = {
  done: 'green',
  todo: 'lime',
  soon: 'lime',
  upcoming: 'outline',
  missed: 'orange',
};

export interface SelectedActivityCardProps {
  readonly slot: AgendaSlot | null;
  readonly badge: SlotBadge | null;
  /** True when « Replanifier » must stay inactive (offline, or slot no longer movable). */
  readonly replanDisabled: boolean;
  readonly replanHint: string | null;
  readonly onOpen: () => void;
  readonly onReplan: () => void;
}

/** Detail of the selected activity, under the timeline. */
export function SelectedActivityCard({
  slot,
  badge,
  replanDisabled,
  replanHint,
  onOpen,
  onReplan,
}: SelectedActivityCardProps) {
  const t = fr.mobile.agenda;
  if (slot === null) {
    return (
      <Card testID="selected-activity">
        <Text variant="rowSubtitle" tone="muted">
          {t.detailEmpty}
        </Text>
      </Card>
    );
  }

  return (
    <Card testID="selected-activity">
      <View style={styles.head}>
        <Text variant="caption" tone="muted" style={styles.tag}>
          {fr.agenda.detailTitle}
        </Text>
        {badge === null ? null : <Chip label={badgeLabel(badge)} tone={CHIP_TONES[badge.kind]} />}
      </View>
      <Text variant="sectionTitle" style={styles.title}>
        {slot.title}
      </Text>
      <Text variant="rowSubtitle" tone="muted">
        {`${civilDayLong(slot.date)} · ${formatMinuteOfDay(slot.startMinutes)}`}
      </Text>
      {slot.meta === null ? null : (
        <Text variant="rowSubtitle" tone="muted">
          {slot.meta}
        </Text>
      )}
      <View style={styles.actions}>
        <Button label={fr.agenda.open} onPress={onOpen} testID="selected-open" />
        <Button
          label={t.replan}
          variant="outline"
          onPress={onReplan}
          disabled={replanDisabled}
          testID="replan"
          {...(replanHint === null ? {} : { accessibilityHint: replanHint })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  tag: { flexShrink: 1 },
  title: { marginTop: theme.spacing.sm },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
});
