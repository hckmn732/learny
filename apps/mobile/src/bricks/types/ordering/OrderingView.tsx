// `ordering` brick (SPEC-3301 EF-5, CL-4, CA-4, ADR-3009 § 4).
//
// Two equivalent paths: tapping an item then another one swaps them (the accessible path, played
// by the Maestro flow), and dragging a row up or down reorders it. A drag never changes the order
// during the gesture — only on release — so an interrupted drag (a phone call, CL-4) leaves the
// list exactly as it was.
import { useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../../theme';
import { Icon, Text } from '../../../ui';
import { moveDown, moveItem, moveUp, tapOrderingItem, type OrderingState } from '../../games';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { orderingIds, orderingResponse } from '../../responses';
import {
  BrickCard,
  Feedback,
  InvalidCharge,
  LiveRegion,
  QuestionHeader,
  Sources,
} from '../../shared';
import { correctionIsCorrect } from '../../verdict';

const t = fr.mobile.bricks;
const DEFAULT_ROW_UNIT = 64;

/** The order to display: the one of the response, completed by any missing item. */
function initialOrder(ids: readonly string[], known: readonly string[]): readonly string[] {
  const kept = known.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

function Row({
  itemId,
  index,
  count,
  text,
  selected,
  locked,
  onTap,
  onMove,
  onUp,
  onDown,
  rowUnit,
}: {
  readonly itemId: string;
  readonly index: number;
  readonly count: number;
  readonly text: string;
  readonly selected: boolean;
  readonly locked: boolean;
  readonly onTap: () => void;
  readonly onMove: (from: number, to: number) => void;
  readonly onUp: () => void;
  readonly onDown: () => void;
  readonly rowUnit: number;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 8,
        onPanResponderRelease: (_event, gesture) => {
          const delta = Math.round(gesture.dy / rowUnit);
          if (delta === 0) return;
          onMove(index, Math.max(0, Math.min(count - 1, index + delta)));
        },
        // An interrupted drag: nothing moved during the gesture, so the row is already home (CL-4).
        onPanResponderTerminate: () => undefined,
      }),
    [count, index, onMove, rowUnit],
  );

  return (
    <View {...responder.panHandlers}>
      <Pressable
        accessibilityHint={t.orderingHelp}
        accessibilityLabel={`${String(index + 1)}. ${text}`}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: locked }}
        disabled={locked}
        onPress={onTap}
        style={[styles.row, selected ? styles.selected : null]}
        testID={`brick-item-${itemId}`}
      >
        <View style={styles.position}>
          <Text variant="label">{String(index + 1)}</Text>
        </View>
        <Text variant="body" style={styles.rowText}>
          {text}
        </Text>
        <View style={styles.moves}>
          <Pressable
            accessibilityLabel={t.moveUp}
            accessibilityRole="button"
            disabled={locked}
            hitSlop={8}
            onPress={onUp}
            testID={`brick-move-up-${itemId}`}
          >
            <Icon name="chevronLeft" size={18} color={theme.colors.ink} />
          </Pressable>
          <Pressable
            accessibilityLabel={t.moveDown}
            accessibilityRole="button"
            disabled={locked}
            hitSlop={8}
            onPress={onDown}
            testID={`brick-move-down-${itemId}`}
          >
            <Icon name="chevronRight" size={18} color={theme.colors.ink} />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

/** One ordering: the shuffled items, their position and the expected position after correction. */
export function OrderingView({
  brick,
  mode,
  correction,
  response,
  onResponse,
  disabled,
  testID,
}: NativeBrickViewProps) {
  const parsed = parsePublicPayload('ordering', brick.publicPayload);
  const ids = parsed.ok ? parsed.payload.items.map((item) => item.id) : [];
  const [state, setState] = useState<OrderingState>(() => ({
    selected: null,
    order: initialOrder(ids, orderingIds(response)),
  }));
  const [announcement, setAnnouncement] = useState('');
  const [rowUnit, setRowUnit] = useState(DEFAULT_ROW_UNIT);

  if (!parsed.ok) return <InvalidCharge type="ordering" testID={testID} />;
  const payload = parsed.payload;
  const graded = correction?.kind === 'ordering' ? correction : undefined;
  const locked = mode === 'read' || disabled === true || graded !== undefined;
  const textOf = new Map(payload.items.map((item) => [item.id, item.text]));

  function publish(next: OrderingState, message: string): void {
    setState(next);
    setAnnouncement(message);
    onResponse?.(orderingResponse(next.order));
  }

  function tap(itemId: string): void {
    if (locked) return;
    const next = tapOrderingItem(state, itemId);
    if (next.selected === null && next.order !== state.order) {
      publish(
        next,
        `${textOf.get(itemId) ?? ''} — ${t.position(
          next.order.indexOf(itemId) + 1,
          next.order.length,
        )}`,
      );
      return;
    }
    setState(next);
  }

  return (
    <BrickCard type="ordering" testID={testID}>
      <QuestionHeader instruction={payload.instruction} type="ordering" />
      <Text variant="caption" tone="muted">
        {t.orderingHelp}
      </Text>
      <View
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height / Math.max(1, state.order.length);
          if (height > 0) setRowUnit(height);
        }}
        style={styles.list}
      >
        {state.order.map((itemId, index) => {
          const position = graded?.positions.find((candidate) => candidate.id === itemId);
          const correct = position?.correct === true;
          const wrong = position !== undefined && !position.correct;
          const expectedPosition = wrong ? position.expectedIndex + 1 : null;
          return (
            <View
              key={itemId}
              style={[styles.slot, correct ? styles.correct : wrong ? styles.wrong : null]}
            >
              <Row
                count={state.order.length}
                rowUnit={rowUnit}
                index={index}
                itemId={itemId}
                locked={locked}
                onDown={() => {
                  if (!locked) publish(moveDown(state, itemId), t.moveDown);
                }}
                onMove={(from, to) => {
                  if (locked) return;
                  publish(
                    { ...state, order: moveItem(state.order, from, to) },
                    t.position(to + 1, state.order.length),
                  );
                }}
                onTap={() => {
                  tap(itemId);
                }}
                onUp={() => {
                  if (!locked) publish(moveUp(state, itemId), t.moveUp);
                }}
                selected={state.selected === itemId}
                text={textOf.get(itemId) ?? ''}
              />
              {expectedPosition === null ? null : (
                <Text variant="caption" tone="danger" testID={`brick-position-${itemId}`}>
                  {t.answerExpected(String(expectedPosition))}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      <LiveRegion message={announcement} />
      {graded === undefined ? null : (
        <Feedback explanation={graded.explanation} isCorrect={correctionIsCorrect(graded)} />
      )}
      <Sources sources={payload.sources} />
    </BrickCard>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.spacing.sm },
  slot: { gap: theme.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    borderRadius: radius.option,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  rowText: { flex: 1 },
  position: {
    width: 28,
    height: 28,
    borderRadius: radius.badge,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.canvas,
  },
  moves: { flexDirection: 'row', gap: theme.spacing.sm },
  selected: { borderColor: theme.colors.ink, backgroundColor: theme.colors.surfaceSubtle },
  correct: { borderLeftWidth: 3, borderLeftColor: theme.colors.green },
  wrong: { borderLeftWidth: 3, borderLeftColor: theme.colors.orange },
});
