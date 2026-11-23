// Detail sheets of the Aujourd'hui screen (SPEC-3201 EF-3, EF-4, EF-5, CL-4; BR-GAM-02, BR-MEM-06).
//
// Five fiches of the mockup: série (14 boxes), rétention (value at one and two months), lacunes (the
// open gaps of the current formation, with « Voir mes lacunes sur le web »), reporter (three windows
// of `GET /slots/:id/alternatives`, then `POST /slots/:id/move`) and journal (every action of the
// week, with « Annuler »). They are non-routed sheets, so they keep the native geometry of
// `Sheet` (canevas § 3) and never hide the screen behind them.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AutomationActionItem, GapListDto, StreakDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { messageFor } from '../../api/errors';
import { useSlotAlternatives, useSlotMove } from '../../data/home';
import { formatShortDay, formatTime } from '../../lib/dates';
import { radius, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { kindLabelOf } from './TutorActionsSection';
import { alternativeLabel } from './view-model';

const t = fr.mobile.today.sheets;

export interface SheetVisibility {
  readonly visible: boolean;
  readonly onClose: () => void;
}

/** EF-4, BR-GAM-02 — « Série » fiche: the days of the server and the fourteen local boxes. */
export function StreakSheet({
  visible,
  onClose,
  streak,
}: SheetVisibility & { readonly streak: StreakDto | null }) {
  const days = streak?.days ?? 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={t.streakTitle(days)} testID="streak-sheet">
      <Text variant="caption" tone="muted">
        {t.streakSubtitle}
      </Text>
      <View style={styles.hero}>
        <Text variant="figure" testID="streak-sheet-days">
          {String(days)}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {days === 1 ? 'jour d’affilée' : 'jours d’affilée'}
        </Text>
      </View>
      <View style={styles.cells} accessibilityLabel={t.streakSubtitle}>
        {(streak?.regularity ?? []).map((day, index) => (
          <View
            key={day.date}
            testID={`streak-cell-${String(index)}`}
            accessibilityLabel={`${formatShortDay(`${day.date}T12:00:00.000Z`, 'UTC')} : ${day.status}`}
            style={[
              styles.cell,
              day.status === 'done' ? styles.cellDone : null,
              day.status === 'neutral' ? styles.cellNeutral : null,
            ]}
          />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {t.streakNote}
      </Text>
      <Button label={t.streakOpenSession} variant="ink" block onPress={onClose} />
    </Sheet>
  );
}

/** EF-4, BR-MEM-06 — « Rétention » fiche: one month, two months, followed and to consolidate. */
export function RetentionSheet({
  visible,
  onClose,
  oneMonth,
  twoMonths,
  followed,
  toConsolidate,
}: SheetVisibility & {
  readonly oneMonth: number | null;
  readonly twoMonths: number | null;
  readonly followed: number | null;
  readonly toConsolidate: number | null;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t.retentionTitle} testID="retention-sheet">
      <Text variant="caption" tone="muted">
        {t.retentionSubtitle}
      </Text>
      <View style={styles.hero}>
        <Text variant="figure" testID="retention-sheet-value">
          {oneMonth === null ? '—' : `${String(oneMonth)} %`}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {t.retentionTitle}
        </Text>
      </View>
      <Text variant="bodySmall" tone="secondary" testID="retention-sheet-two-months">
        {twoMonths === null ? t.retentionNoTwoMonths : t.retentionTwoMonths(twoMonths)}
      </Text>
      <View style={styles.miniStats}>
        <MiniStat value={followed} label={t.retentionFollowed} />
        <MiniStat value={toConsolidate} label={t.retentionConsolidate} />
      </View>
      {oneMonth === null ? (
        <Text variant="caption" tone="muted" testID="retention-sheet-no-measure">
          {t.retentionNoMeasure}
        </Text>
      ) : null}
    </Sheet>
  );
}

function MiniStat({ value, label }: { readonly value: number | null; readonly label: string }) {
  return (
    <View style={styles.miniStat}>
      <Text variant="title">{value === null ? '—' : String(value)}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

/** EF-4, BR-LAC-05 — « Lacunes » fiche: the open gaps and the web hand-off. */
export function GapsSheet({
  visible,
  onClose,
  gaps,
  onOpenWeb,
}: SheetVisibility & { readonly gaps: GapListDto | null; readonly onOpenWeb: () => void }) {
  const count = gaps?.summary.openGaps ?? 0;
  return (
    <Sheet visible={visible} onClose={onClose} title={t.gapsTitle} testID="gaps-sheet">
      <Text variant="caption" tone="muted">
        {t.gapsSubtitle(count)}
      </Text>
      {gaps === null ? <Skeleton animated={false} lines={4} /> : null}
      {gaps !== null && gaps.items.length === 0 ? (
        <Text variant="bodySmall" tone="muted" testID="gaps-sheet-empty">
          {t.gapsEmpty}
        </Text>
      ) : null}
      {(gaps?.items ?? []).map((gap) => (
        <View key={gap.notionId} style={styles.gapRow} testID={`gaps-item-${gap.notionId}`}>
          <View style={styles.gapIcon}>
            <Icon name="alert" size={16} color={theme.colors.orangeInk} />
          </View>
          <View style={styles.gapBody}>
            <Text variant="rowTitle">{gap.notionLabel}</Text>
            <Text variant="rowSubtitle" tone="muted">
              {`${t.gapsModule(gap.modulePosition)} · ${String(Math.round(gap.mastery))} %`}
            </Text>
          </View>
        </View>
      ))}
      <Button
        label={t.gapsWeb}
        variant="primary"
        block
        testID="gaps-open-web"
        onPress={onOpenWeb}
      />
    </Sheet>
  );
}

/** EF-3, CL-4 — « Reporter la séance »: three windows, then the move. */
export function LaterSheet({
  visible,
  onClose,
  slotId,
  timeZone,
  online,
  onMoved,
  onOpenAgenda,
}: SheetVisibility & {
  readonly slotId: string | null;
  readonly timeZone: string;
  readonly online: boolean;
  readonly onMoved: (label: string) => void;
  readonly onOpenAgenda: () => void;
}) {
  const alternatives = useSlotAlternatives(slotId, visible);
  const mover = useSlotMove();
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setError(null);
    onClose();
  };

  const choose = (startsAt: string, endsAt: string): void => {
    if (alternatives.data === null) return;
    setError(null);
    void mover
      .move({
        slotId: alternatives.data.slotId,
        expectedVersion: alternatives.data.version,
        startsAt,
        endsAt,
      })
      .then(() => {
        onMoved(alternativeLabel({ startsAt }, timeZone));
        close();
      })
      .catch((cause: unknown) => {
        setError(messageFor(cause));
      });
  };

  const items = alternatives.data?.alternatives ?? [];

  return (
    <Sheet visible={visible} onClose={close} title={t.laterTitle} testID="later-sheet">
      <Text variant="caption" tone="muted">
        {t.laterSubtitle}
      </Text>
      {alternatives.status === 'loading' ? <Skeleton animated={false} lines={3} /> : null}
      {alternatives.status === 'ready' && items.length === 0 ? (
        <View style={styles.empty} testID="later-empty">
          <Text variant="title">{t.laterEmpty}</Text>
          <Text variant="bodySmall" tone="muted">
            {t.laterEmptyBody}
          </Text>
          <Button label={t.laterAgenda} variant="outline" block onPress={onOpenAgenda} />
        </View>
      ) : null}
      {items.map((alternative, index) => {
        const minutes = Math.max(
          1,
          Math.round((Date.parse(alternative.endsAt) - Date.parse(alternative.startsAt)) / 60_000),
        );
        return (
          <Pressable
            key={alternative.startsAt}
            testID={`later-slot-${String(index)}`}
            accessibilityRole="button"
            accessibilityLabel={`${alternativeLabel(alternative, timeZone)}, ${String(minutes)} min`}
            accessibilityState={{ disabled: !online || mover.pending }}
            disabled={!online || mover.pending}
            onPress={() => {
              choose(alternative.startsAt, alternative.endsAt);
            }}
            style={({ pressed }) => [styles.slot, pressed ? styles.slotPressed : null]}
          >
            <View style={styles.slotBody}>
              <Text variant="title">{alternativeLabel(alternative, timeZone)}</Text>
              <Text variant="rowSubtitle" tone="muted">{`${String(minutes)} min`}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={theme.colors.inkMuted} />
          </Pressable>
        );
      })}
      {error === null ? null : (
        <Text variant="caption" tone="danger" testID="later-error">
          {error}
        </Text>
      )}
      <Text variant="caption" tone="muted">
        {t.laterNote}
      </Text>
    </Sheet>
  );
}

/** BR-AUT-12 — « Tout voir »: the journal of the week with « Annuler ». */
export function TutorFeedSheet({
  visible,
  onClose,
  items,
  weekCount,
  online,
  busy,
  onUndo,
}: SheetVisibility & {
  readonly items: readonly AutomationActionItem[];
  readonly weekCount: number;
  readonly online: boolean;
  readonly busy: boolean;
  readonly onUndo: (item: AutomationActionItem) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={t.feedTitle} testID="tutor-feed-sheet">
      <Text variant="caption" tone="muted">
        {fr.mobile.today.tutor.weekCount(weekCount)}
      </Text>
      {items.length === 0 ? (
        <Text variant="bodySmall" tone="muted">
          {t.feedSubtitle}
        </Text>
      ) : null}
      {items.map((item, index) => (
        <View key={item.id} style={styles.feedRow} testID={`feed-item-${String(index)}`}>
          <View style={styles.feedHead}>
            <Text variant="label" tone="muted">
              {kindLabelOf(item)}
            </Text>
            <Text variant="caption" tone="muted">
              {item.status === 'pending_consent'
                ? fr.mobile.today.tutor.pending
                : fr.mobile.today.tutor.recent}
            </Text>
          </View>
          <Text variant="bodySmall" tone="secondary">
            {item.summary}
          </Text>
          {item.status === 'applied' ? (
            <Button
              label={fr.mobile.today.tutor.undo}
              size="sm"
              variant="outline"
              testID={`feed-undo-${String(index)}`}
              disabled={!online || busy}
              onPress={() => {
                onUndo(item);
              }}
            />
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  cell: {
    width: 18,
    height: 18,
    borderRadius: radius.control - 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cellDone: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  cellNeutral: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.surfaceMuted,
  },
  miniStats: { flexDirection: 'row', gap: theme.spacing.xl },
  miniStat: { gap: 2 },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  gapIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: theme.colors.orangeSoft,
  },
  gapBody: { flex: 1, minWidth: 0, gap: 1 },
  empty: { gap: theme.spacing.sm },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: radius.option,
    backgroundColor: theme.colors.surface,
  },
  slotPressed: { backgroundColor: theme.colors.surfaceSubtle },
  slotBody: { flex: 1, minWidth: 0, gap: 1 },
  feedRow: { gap: theme.spacing.xs },
  feedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

/** Formats a slot label for the announcement of the later sheet (`jeu. 12 nov. 10:30`). */
export function slotLabelOf(startsAt: string, timeZone: string): string {
  return `${formatShortDay(startsAt, timeZone)} ${formatTime(startsAt, timeZone)}`;
}
