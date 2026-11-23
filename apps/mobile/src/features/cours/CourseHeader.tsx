// Header of the course screen (SPEC-3302 EF-1, BR-NAV-04; ADR-3003).
//
// The web breadcrumb becomes « Chapitre 2 sur 4 » with the back chevron that returns to the
// Programme tab, a « Sommaire » button and the lime reading bar right under the bar. The bookmark
// of the mockup is not implemented: no rule and no route carry it (ADR-3003 § 2).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { IconButton } from '../../ui/IconButton';
import { ProgressBar } from '../../ui/ProgressBar';
import { Text } from '../../ui/Text';

const m = fr.mobile.cours;

export interface CourseHeaderProps {
  /** « Chapitre 2 sur 4 » (BR-NAV-04). */
  readonly badge: string;
  /** Percentage of the chapter shown by the bar (BR-COU-08). */
  readonly percent: number;
  readonly onBack: () => void;
  readonly onToc: () => void;
}

/** Navigation bar and reading bar of the course screen. */
export function CourseHeader({ badge, percent, onBack, onToc }: CourseHeaderProps) {
  return (
    <View style={styles.root} testID="course-header">
      <View style={styles.bar}>
        <IconButton
          accessibilityLabel={m.header.back}
          name="chevronLeft"
          onPress={onBack}
          testID="course-back"
          variant="plain"
        />
        <View accessibilityRole="header" style={styles.title}>
          <Text align="center" numberOfLines={1} testID="course-badge" variant="sectionTitle">
            {badge}
          </Text>
        </View>
        <IconButton
          accessibilityLabel={m.header.openToc}
          name="list"
          onPress={onToc}
          testID="course-toc"
          variant="plain"
        />
      </View>
      <ProgressBar
        label={m.header.progressLabel(percent)}
        testID="course-progress"
        value={percent / 100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  title: { flex: 1, minWidth: 0 },
});
