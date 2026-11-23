// One chapter row of the open module (SPEC-3202 EF-4, EF-5; BR-FOR-07, BR-COU-08).
//
// State marker of the mockup — check for a validated chapter, ink number for the chapter in
// course, outlined number for a chapter to come — the title, the remaining reading time or
// « Validé », and a 48 dp target that opens the course of the chapter.
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme, verticalHitSlop } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

import type { ChapterView } from './view-model';

const t = fr.mobile.programme;

export interface ChapterRowProps {
  readonly chapter: ChapterView;
  readonly onPress: () => void;
}

/** Readable chapter of a module, with its state and its reading progress. */
export function ChapterRow({ chapter, onPress }: ChapterRowProps) {
  const validated = chapter.state === 'validated';
  const current = chapter.state === 'current';
  return (
    <Pressable
      testID={`chapter-${chapter.id}`}
      accessibilityRole="button"
      accessibilityLabel={chapter.accessibilityLabel}
      accessibilityHint={t.chapter.open(chapter.title)}
      onPress={onPress}
      hitSlop={verticalHitSlop(48)}
      style={({ pressed }) => [styles.base, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.marker,
          validated ? styles.markerDone : current ? styles.markerCurrent : styles.markerTodo,
        ]}
      >
        {validated ? (
          <Icon name="check" size={13} color={theme.colors.greenInk} />
        ) : (
          <Text variant="caption" tone={current ? 'limeInk' : 'muted'}>
            {String(chapter.position)}
          </Text>
        )}
      </View>
      <Text
        variant="body"
        numberOfLines={2}
        style={[styles.title, validated ? styles.titleDone : null]}
      >
        {chapter.title}
      </Text>
      {chapter.meta === null ? null : (
        <Text variant="caption" tone="muted" style={styles.meta}>
          {chapter.meta}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  marker: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
  },
  markerDone: { backgroundColor: theme.colors.greenSoft, borderColor: theme.colors.greenSoft },
  markerCurrent: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  markerTodo: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong },
  title: { flex: 1, minWidth: 0 },
  titleDone: { color: theme.colors.inkSecondary },
  meta: { maxWidth: '32%', textAlign: 'right' },
});
