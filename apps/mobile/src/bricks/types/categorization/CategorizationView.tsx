// `categorization` brick (SPEC-3301 EF-5, CA-4): items filed into categories by successive taps.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../../theme';
import { Text } from '../../../ui';
import { emptyCategorization, tapCategory, tapItem, type CategorizationState } from '../../games';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { categorizationAssignments, categorizationResponse } from '../../responses';
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

/** One categorization: the items, the categories and the correction item by item. */
export function CategorizationView({
  brick,
  mode,
  correction,
  response,
  onResponse,
  disabled,
  testID,
}: NativeBrickViewProps) {
  const parsed = parsePublicPayload('categorization', brick.publicPayload);
  const itemIds = parsed.ok ? parsed.payload.items.map((item) => item.id) : [];
  const [state, setState] = useState<CategorizationState>(() => ({
    ...emptyCategorization(itemIds),
    assignments: {
      ...emptyCategorization(itemIds).assignments,
      ...categorizationAssignments(response),
    },
  }));
  const [announcement, setAnnouncement] = useState('');

  if (!parsed.ok) return <InvalidCharge type="categorization" testID={testID} />;
  const payload = parsed.payload;
  const graded = correction?.kind === 'categorization' ? correction : undefined;
  const locked = mode === 'read' || disabled === true || graded !== undefined;
  const labelOfCategory = new Map(
    payload.categories.map((category) => [category.id, category.label]),
  );

  function publish(next: CategorizationState, message: string): void {
    setState(next);
    setAnnouncement(message);
    onResponse?.(categorizationResponse(next.assignments));
  }

  return (
    <BrickCard type="categorization" testID={testID}>
      <QuestionHeader instruction={payload.instruction} type="categorization" />
      <Text variant="caption" tone="muted">
        {t.categorizationHelp}
      </Text>
      <View style={styles.list}>
        {payload.items.map((item) => {
          const assigned = state.assignments[item.id] ?? null;
          const grade = graded?.items.find((candidate) => candidate.id === item.id);
          const correct = grade?.correct === true;
          const wrong = grade !== undefined && !grade.correct;
          const expected = wrong ? grade.expectedCategoryLabel : null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: state.selectedItem === item.id, disabled: locked }}
              disabled={locked}
              key={item.id}
              onPress={() => {
                if (locked) return;
                setState(tapItem(state, item.id));
              }}
              style={[
                styles.row,
                state.selectedItem === item.id ? styles.selected : null,
                correct ? styles.correct : wrong ? styles.wrong : null,
              ]}
              testID={`brick-item-${item.id}`}
            >
              <Text variant="body">{item.text}</Text>
              <Text variant="caption" tone="secondary">
                {assigned === null ? t.unassigned : (labelOfCategory.get(assigned) ?? '')}
              </Text>
              {expected === null ? null : (
                <Text variant="caption" tone="danger">
                  {t.answerExpected(expected)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <View style={styles.categories}>
        {payload.categories.map((category) => (
          <Pressable
            accessibilityHint={t.categorizationHelp}
            accessibilityLabel={category.label}
            accessibilityRole="button"
            accessibilityState={{ disabled: locked || state.selectedItem === null }}
            disabled={locked}
            key={category.id}
            onPress={() => {
              if (locked || state.selectedItem === null) return;
              const item = payload.items.find((candidate) => candidate.id === state.selectedItem);
              const next = tapCategory(state, category.id);
              publish(next, t.placed(item?.text ?? '', category.label));
            }}
            style={styles.category}
            testID={`brick-category-${category.id}`}
          >
            <Text variant="rowTitle">{category.label}</Text>
            {payload.items
              .filter((item) => state.assignments[item.id] === category.id)
              .map((item) => (
                <Text key={item.id} variant="caption" tone="secondary">
                  {item.text}
                </Text>
              ))}
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
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
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
  category: {
    flexGrow: 1,
    flexBasis: 140,
    gap: theme.spacing.xs,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.canvas,
    padding: theme.spacing.md,
  },
  selected: { borderColor: theme.colors.ink, backgroundColor: theme.colors.surfaceSubtle },
  correct: { borderColor: theme.colors.green, backgroundColor: theme.colors.greenSoft },
  wrong: { borderColor: theme.colors.orange, backgroundColor: theme.colors.orangeSoft },
});
