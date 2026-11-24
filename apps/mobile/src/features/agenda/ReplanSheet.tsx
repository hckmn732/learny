// Replanning of one activity (SPEC-3203 EF-7, BR-AGE-05, CA-4, CL-1, CL-4).
//
// The sheet reads the three windows proposed by the planner (`GET /slots/:id/alternatives`), the
// learner picks one, confirms, then `POST /slots/:id/move` runs with the `Idempotency-Key` of the
// intent. A conflict means another session moved the slot in between: the sheet drops the choice,
// re-reads the proposals and lets the screen announce « Ce créneau vient de changer » (CL-1).
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AgendaSlot, SlotAlternative, SlotMoveOutput } from '@learny/contracts';
import { AppError } from '@learny/core';
import { fr } from '@learny/i18n';

import { useIdempotencyKey } from '../../api/use-idempotency-key';
import { useMoveSlot, useSlotAlternatives } from '../../data/use-agenda';
import { civilDayShort } from '../../lib/dates';
import { openOnWeb } from '../../lib/web';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { formatMinuteOfDay } from './period';

/** Words of the moments of the planner (`SlotAlternativeMoment` of the contract). */
function momentLabel(moment: SlotAlternative['moment']): string {
  const t = fr.mobile.agenda.replanSheet;
  if (moment === 'matin') return t.momentMatin;
  if (moment === 'apres_midi') return t.momentApresMidi;
  return t.momentSoir;
}

/** `09:00 – 09:40` — the window of a proposal. */
function windowLabel(alternative: SlotAlternative): string {
  return `${formatMinuteOfDay(alternative.startMinutes)} – ${formatMinuteOfDay(alternative.endMinutes)}`;
}

export interface ReplanSheetProps {
  readonly slot: AgendaSlot | null;
  readonly visible: boolean;
  readonly online: boolean;
  readonly onClose: () => void;
  readonly onMoved: (result: SlotMoveOutput) => void;
  readonly onConflict: () => void;
}

/** Sheet of the three proposals and of the confirmation of the move. */
export function ReplanSheet({
  slot,
  visible,
  online,
  onClose,
  onMoved,
  onConflict,
}: ReplanSheetProps) {
  const t = fr.mobile.agenda.replanSheet;
  const agendaWords = fr.mobile.agenda;
  const slotId = slot?.id ?? null;
  const alternatives = useSlotAlternatives(slotId, visible && online);
  const move = useMoveSlot();
  const key = useIdempotencyKey(`slot-move:${slotId ?? 'none'}`);
  // The choice is bound to the slot it was made on: another sheet, or another slot, starts from
  // the proposals without any effect resetting the state (CL-1).
  const [choice, setChoice] = useState<{
    readonly slotId: string | null;
    readonly index: number;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const data = alternatives.data;
  const proposals = data?.alternatives ?? [];
  const chosen = choice !== null && choice.slotId === slotId ? choice.index : null;
  const option = chosen === null ? null : (proposals[chosen] ?? null);

  const close = (): void => {
    setChoice(null);
    setFailure(null);
    onClose();
  };

  const confirm = (): void => {
    if (slot === null || data === null || option === null) return;
    setFailure(null);
    void move
      .move({
        slotId: slot.id,
        expectedVersion: data.version,
        startsAt: option.startsAt,
        endsAt: option.endsAt,
        idempotencyKey: key.key,
      })
      .then((result) => {
        key.resolve();
        setChoice(null);
        onMoved(result);
      })
      .catch((error: unknown) => {
        setChoice(null);
        if (error instanceof AppError && error.code === 'CONFLICT') {
          // CL-1 — the slot changed elsewhere: new proposals, then the toast of the screen.
          alternatives.retry();
          onConflict();
          return;
        }
        setFailure(t.errorTitle);
      });
  };

  return (
    <Sheet visible={visible} onClose={close} title={t.title} testID="replan-sheet">
      {slot === null ? null : (
        <Text variant="rowSubtitle" tone="muted" numberOfLines={2}>
          {`${slot.title} · ${civilDayShort(slot.date)}`}
        </Text>
      )}

      {online ? null : (
        <Text testID="replan-offline" variant="rowSubtitle" tone="danger">
          {agendaWords.replanOffline}
        </Text>
      )}

      {online && alternatives.status === 'loading' ? (
        <Skeleton testID="replan-loading" lines={3} animated={false} />
      ) : null}

      {online && alternatives.status === 'error' ? (
        <ErrorState testID="replan-error" title={t.errorTitle} onRetry={alternatives.retry} />
      ) : null}

      {online && alternatives.status === 'ready' && proposals.length === 0 ? (
        <EmptyState
          testID="replan-empty"
          icon="calendar"
          title={t.emptyTitle}
          description={t.emptyBody}
          action={{
            label: t.emptyAction,
            onPress: () => {
              void openOnWeb('/agenda');
            },
          }}
        />
      ) : null}

      {online && proposals.length > 0 ? (
        <>
          <Text variant="label" tone="muted">
            {t.optionsLabel}
          </Text>
          <View accessibilityRole="menu" style={styles.options}>
            {proposals.map((candidate, index) => {
              const selected = chosen === index;
              return (
                <Pressable
                  key={`${candidate.startsAt}-${String(index)}`}
                  testID={`replan-option-${String(index)}`}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`${civilDayShort(candidate.date)}, ${windowLabel(candidate)}, ${momentLabel(candidate.moment)}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setChoice({ slotId, index });
                    setFailure(null);
                  }}
                  style={[styles.option, selected ? styles.optionSelected : null]}
                >
                  <View style={styles.optionHead}>
                    <Text variant="rowTitle" style={styles.optionTitle}>
                      {t.optionLabel(civilDayShort(candidate.date), windowLabel(candidate))}
                    </Text>
                    <Chip label={momentLabel(candidate.moment)} tone="indigo" />
                  </View>
                  <Text variant="rowSubtitle" tone="muted">
                    {candidate.reasons.join(' · ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {option === null ? null : (
        <Card testID="replan-confirm-block">
          <Text variant="rowTitle">
            {t.confirmTitle(civilDayShort(option.date), formatMinuteOfDay(option.startMinutes))}
          </Text>
          <Text variant="rowSubtitle" tone="muted">
            {t.confirmText}
          </Text>
          <View style={styles.actions}>
            <Button
              label={t.confirm}
              onPress={confirm}
              loading={move.pending}
              testID="replan-confirm"
              size="sm"
            />
            <Button
              label={t.cancel}
              variant="outline"
              size="sm"
              onPress={() => {
                setChoice(null);
              }}
              testID="replan-cancel"
            />
          </View>
        </Card>
      )}

      {failure === null ? null : (
        <Text variant="rowSubtitle" tone="danger">
          {failure}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  options: { gap: theme.spacing.sm },
  option: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.list,
    backgroundColor: theme.colors.surface,
  },
  optionSelected: { borderColor: theme.colors.ink },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  optionTitle: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
});
