// Summary sheet of the course (SPEC-3302 EF-6, BR-COU-11).
//
// The chapters of the module with their reading state - check for a read chapter, ink number for the
// current one, outlined number for a chapter to come - and the sections of the current chapter; a
// press scrolls the article to the section (EF-6).
import { Pressable, StyleSheet, View } from 'react-native';

import type { CourseChapterSummary, CourseSection } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { radius, theme, verticalHitSlop } from '../../theme';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import { sectionLabel } from './view-model';

const m = fr.mobile.cours;

export interface CourseTocSheetProps {
  readonly visible: boolean;
  readonly chapters: readonly CourseChapterSummary[];
  readonly sections: readonly CourseSection[];
  readonly currentChapterId: string | null;
  readonly onClose: () => void;
  readonly onChapter: (chapterId: string) => void;
  readonly onSection: (section: CourseSection) => void;
}

/** Table of contents of the module: chapters, then the sections of the current chapter (EF-6). */
export function CourseTocSheet({
  visible,
  chapters,
  sections,
  currentChapterId,
  onClose,
  onChapter,
  onSection,
}: CourseTocSheetProps) {
  if (!visible) return null;
  return (
    <Sheet onClose={onClose} visible testID="course-toc-sheet" title={m.toc.title}>
      <Text tone="muted" variant="label">
        {m.toc.chapters}
      </Text>
      {chapters.map((chapter) => {
        const current = chapter.id === currentChapterId;
        const read = chapter.percent >= 100;
        return (
          <View key={chapter.id}>
            <Pressable
              accessibilityLabel={m.toc.chapter(chapter.position, chapter.title, chapter.percent)}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              onPress={() => {
                onChapter(chapter.id);
              }}
              hitSlop={verticalHitSlop(theme.minTouchTarget.height)}
              style={styles.row}
              testID={`course-toc-chapter-${chapter.id}`}
            >
              <View
                style={[
                  styles.marker,
                  read ? styles.markerRead : current ? styles.markerCurrent : styles.markerTodo,
                ]}
              >
                {read ? (
                  <Icon color={theme.colors.ink} name="check" size={13} />
                ) : (
                  <Text tone={current ? 'inverse' : 'muted'} variant="caption">
                    {String(chapter.position)}
                  </Text>
                )}
              </View>
              <Text style={styles.grow} variant="body">
                {chapter.title}
              </Text>
              {current ? (
                <Text tone="muted" variant="caption">
                  {chapter.percent >= 100 ? m.toc.read : `${String(chapter.percent)} %`}
                </Text>
              ) : null}
            </Pressable>
            {current
              ? sections.map((section) => (
                  <Pressable
                    accessibilityLabel={m.toc.section(sectionLabel(section))}
                    accessibilityRole="button"
                    key={section.id}
                    onPress={() => {
                      onSection(section);
                    }}
                    style={styles.sectionRow}
                    testID={`course-toc-section-${section.id}`}
                  >
                    <Text tone="secondary" variant="caption">
                      {sectionLabel(section)}
                    </Text>
                  </Pressable>
                ))
              : null}
          </View>
        );
      })}
      {sections.length === 0 ? null : (
        <Text tone="muted" variant="label">
          {m.toc.sections}
        </Text>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.minTouchTarget.height,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
  },
  markerRead: { backgroundColor: theme.colors.lime, borderColor: theme.colors.lime },
  markerCurrent: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  markerTodo: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong },
  grow: { flex: 1, minWidth: 0 },
  sectionRow: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.control,
    paddingVertical: theme.spacing.sm,
    paddingLeft: theme.spacing.xxxl,
  },
});
