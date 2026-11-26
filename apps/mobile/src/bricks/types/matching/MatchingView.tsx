// `matching` brick (SPEC-3301 EF-5, CA-4, ADR-3009 § 4): pairs played by successive taps.
//
// The learner touches a notion, then its definition; the same right touched twice releases the
// notion. The tap path is the accessible one and the one the Maestro flow plays; the state machine
// lives in `games.ts` so that it is covered without a device.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { withReadableMath } from '../../../lib/latex-text';
import { radius, theme } from '../../../theme';
import { Text } from '../../../ui';
import { emptyMatching, tapLeft, tapRight, type MatchingState } from '../../games';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { matchingPairs, matchingResponse } from '../../responses';
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

/** One matching: the notions, the definitions and the correction pair by pair. */
export function MatchingView({
  brick,
  mode,
  correction,
  response,
  onResponse,
  disabled,
  testID,
}: NativeBrickViewProps) {
  const parsed = parsePublicPayload('matching', brick.publicPayload);
  const payload = parsed.ok ? parsed.payload : null;
  const [state, setState] = useState<MatchingState>(() => {
    const empty = emptyMatching(payload?.lefts.map((left) => left.id) ?? []);
    return { selectedLeft: null, pairs: { ...empty.pairs, ...matchingPairs(response) } };
  });
  const [announcement, setAnnouncement] = useState('');

  if (!parsed.ok || payload === null) return <InvalidCharge type="matching" testID={testID} />;
  const graded = correction?.kind === 'matching' ? correction : undefined;
  const locked = mode === 'read' || disabled === true || graded !== undefined;
  const textOfLeft = new Map(payload.lefts.map((left) => [left.id, left.text]));
  const textOfRight = new Map(payload.rights.map((right) => [right.id, right.text]));
  const usedRights = new Set(Object.values(state.pairs).filter((id): id is string => id !== null));

  function publish(next: MatchingState, message: string): void {
    setState(next);
    setAnnouncement(message);
    onResponse?.(matchingResponse(next.pairs));
  }

  return (
    <BrickCard type="matching" testID={testID}>
      <QuestionHeader instruction={payload.instruction} type="matching" />
      <Text variant="caption" tone="muted">
        {t.matchingHelp}
      </Text>
      <View style={styles.list}>
        {payload.lefts.map((left) => {
          const placed = state.pairs[left.id] ?? null;
          const state_ = graded?.pairs.find((pair) => pair.pairId === left.id);
          const correct = state_?.correct === true;
          const wrong = state_ !== undefined && !state_.correct;
          const expected = wrong ? state_.expectedRight : null;
          return (
            <View key={left.id} style={styles.list}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: state.selectedLeft === left.id, disabled: locked }}
                disabled={locked}
                onPress={() => {
                  if (locked) return;
                  setState(tapLeft(state, left.id));
                }}
                style={[
                  styles.row,
                  state.selectedLeft === left.id ? styles.selected : null,
                  correct ? styles.correct : wrong ? styles.wrong : null,
                ]}
                testID={`brick-item-${left.id}`}
              >
                <Text variant="body">{withReadableMath(left.text)}</Text>
              </Pressable>
              {/* The placement is a sibling of the button, not a child: a pressable is one node of
                the accessibility tree, so a child text would never be announced on its own. */}
              {placed === null ? null : (
                <Text variant="caption" tone="secondary" testID={`brick-placed-${left.id}`}>
                  {textOfRight.get(placed) ?? ''}
                </Text>
              )}
              {expected === null ? null : (
                <Text variant="caption" tone="danger">
                  {t.answerExpected(expected)}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.list}>
        {payload.rights.map((right) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: locked }}
            disabled={locked}
            key={right.id}
            onPress={() => {
              if (locked) return;
              const next = tapRight(state, right.id);
              if (next === state) return;
              const left =
                state.selectedLeft === null ? '' : (textOfLeft.get(state.selectedLeft) ?? '');
              const placedRight = next.pairs[state.selectedLeft ?? ''] ?? null;
              publish(
                next,
                placedRight === null
                  ? t.unlinked(left)
                  : t.linked(left, textOfRight.get(placedRight) ?? ''),
              );
            }}
            style={[styles.chip, usedRights.has(right.id) ? styles.used : null]}
            testID={`brick-item-${right.id}`}
          >
            <Text variant="bodySmall">{withReadableMath(right.text)}</Text>
          </Pressable>
        ))}
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
  row: {
    gap: theme.spacing.xs,
    minHeight: theme.controls.row,
    justifyContent: 'center',
    borderRadius: radius.option,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.canvas,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  selected: { borderColor: theme.colors.ink, backgroundColor: theme.colors.surfaceSubtle },
  correct: { borderColor: theme.colors.green, backgroundColor: theme.colors.greenSoft },
  wrong: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orangeSoft },
  used: { opacity: 0.6 },
});
