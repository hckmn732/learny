// Animated module accordion of the Programme tab (SPEC-3202 EF-4, ET-2; BR-FOR-07, BR-FOR-08).
//
// The open module is unfolded by default; validated and upcoming modules are collapsed; a locked
// module cannot be unfolded and opens the fiche of its unlock condition (BR-FOR-08). The content
// height is measured and animated with Reanimated; the duration is 0 ms when the system asks to
// reduce motion (ET-2). The header is a button that announces `expanded`.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { fr } from '@learny/i18n';

import { useReducedMotion } from '../../lib/motion';
import { transitionDuration } from '../../lib/reduce-motion';
import { theme, verticalHitSlop } from '../../theme';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

import { ChapterRow } from './ChapterRow';
import type { ChapterView, ModuleView, ResumeView } from './view-model';

const t = fr.mobile.programme;

export interface ModuleAccordionProps {
  readonly module: ModuleView;
  readonly resume: ResumeView | null;
  readonly onChapter: (chapter: ChapterView, module: ModuleView) => void;
  readonly onQuiz: (module: ModuleView) => void;
  readonly onResume: (resume: ResumeView, module: ModuleView) => void;
  readonly onLocked: (module: ModuleView) => void;
  readonly onDetail: (module: ModuleView) => void;
}

function statusTone(module: ModuleView): 'lime' | 'green' | 'neutral' {
  if (module.status === 'validated') return 'green';
  if (module.status === 'open') return theme.platform === 'ios' ? 'lime' : 'neutral';
  return 'neutral';
}

/** Header and (unfolded) chapters of one module. */
export function ModuleAccordion({
  module,
  resume,
  onChapter,
  onQuiz,
  onResume,
  onLocked,
  onDetail,
}: ModuleAccordionProps) {
  const [expanded, setExpanded] = useState(module.expandedByDefault && !module.locked);
  const [height, setHeight] = useState(0);
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: transitionDuration(reduceMotion),
    });
  }, [expanded, progress, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    height: Math.round(height * progress.value),
    opacity: progress.value,
  }));

  const toggle = (): void => {
    if (module.locked) {
      onLocked(module);
      return;
    }
    setExpanded((value) => !value);
  };

  return (
    <View testID={`module-${String(module.position)}`} style={styles.card}>
      <Pressable
        testID={`module-${String(module.position)}-toggle`}
        accessibilityRole="button"
        accessibilityLabel={t.module.toggle(module.position, module.title)}
        accessibilityState={{ expanded: module.locked ? false : expanded, disabled: false }}
        onPress={toggle}
        hitSlop={verticalHitSlop(theme.controls.row)}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.8 : 1 }]}
      >
        <View
          style={[styles.number, module.status === 'open' ? styles.numberOpen : styles.numberIdle]}
        >
          <Text variant="rowTitle" tone={module.status === 'open' ? 'primary' : 'muted'}>
            {String(module.position)}
          </Text>
        </View>
        <View style={styles.grow}>
          <View style={styles.line}>
            <Text variant="sectionTitle" numberOfLines={2} style={styles.title}>
              {module.title}
            </Text>
            {module.status === 'locked' ? (
              <Icon name="lock" size={16} color={theme.colors.inkMuted} />
            ) : (
              <Chip label={module.statusLabel} tone={statusTone(module)} />
            )}
          </View>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {module.meta}
          </Text>
        </View>
        {module.locked ? null : (
          <Icon
            name={expanded ? 'chevronDown' : 'chevronRight'}
            size={18}
            color={theme.colors.inkMuted}
          />
        )}
      </Pressable>

      {module.locked ? null : (
        <Animated.View
          style={[styles.body, height > 0 || !expanded ? animated : styles.bodyUnfolded]}
          testID={`module-${String(module.position)}-body`}
        >
          <View
            testID={`module-${String(module.position)}-content`}
            onLayout={(event) => {
              setExpandedHeight(event.nativeEvent.layout.height, setHeight);
            }}
          >
            {module.chapters.map((chapter) => (
              <ChapterRow
                key={chapter.id}
                chapter={chapter}
                onPress={() => {
                  onChapter(chapter, module);
                }}
              />
            ))}
            {module.href === null ? null : (
              <Pressable
                testID={`module-${String(module.position)}-quiz`}
                accessibilityRole="button"
                accessibilityLabel={module.quizLabel}
                onPress={() => {
                  onQuiz(module);
                }}
                style={styles.quizRow}
              >
                <Icon name="cards" size={16} color={theme.colors.inkMuted} />
                <Text variant="body" style={styles.grow}>
                  {module.quizLabel}
                </Text>
                <Text variant="caption" tone="muted">
                  {module.quizKind === 'exam' ? t.module.exam : t.module.quiz}
                </Text>
                <Icon name="chevronRight" size={16} color={theme.colors.inkMuted} />
              </Pressable>
            )}
            {resume !== null && module.status === 'open' ? (
              <View style={styles.actions}>
                <Button
                  testID="programme-resume"
                  label={resume.label}
                  variant="ink"
                  size="sm"
                  block
                  onPress={() => {
                    onResume(resume, module);
                  }}
                />
                <Button
                  testID={`module-${String(module.position)}-detail`}
                  label={t.module.detail}
                  variant="text"
                  size="sm"
                  onPress={() => {
                    onDetail(module);
                  }}
                />
              </View>
            ) : null}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function setExpandedHeight(value: number, setter: (next: number) => void): void {
  if (value > 0) setter(value);
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  head: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  number: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
  },
  numberOpen: { backgroundColor: theme.colors.lime },
  numberIdle: { backgroundColor: theme.colors.surfaceSubtle },
  grow: { flex: 1, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { flex: 1, minWidth: 0 },
  body: { overflow: 'hidden' },
  // Before the first measurement the unfolded body keeps its natural height: inside a clipped
  // zero-height parent the inner view lays out at 0, so `onLayout` would never report a height
  // and the accordion could never unfold (EF-4). Once measured, the animated height takes over.
  bodyUnfolded: { opacity: 1 },
  quizRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  actions: { gap: theme.spacing.sm, paddingVertical: theme.spacing.md, paddingLeft: 48 },
});
