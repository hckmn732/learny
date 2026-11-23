// Section « À suivre » (SPEC-3201 EF-2, EF-6; BR-PRO-02).
//
// The remaining activities of the day, in the order the server returned them: hour, colour dot of
// the kind, title, detail and the status « Fait », « Dans N min », « À venir » or « Manqué ». A row
// opens the same destination as the hero card (EF-6).
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

import type { DayLine } from './view-model';

const t = fr.mobile.today.sections;

/** Colour of the dot: the kind of the activity, as in the agenda (BR-PRO-02). */
function dotColorOf(line: DayLine): string {
  if (line.state === 'done') return theme.colors.inkMuted;
  if (line.state === 'missed') return theme.colors.orange;
  if (line.kind === 'validation_quiz') return theme.colors.lime;
  if (line.kind === 'global_quiz' || line.kind === 'revision' || line.kind === 'sprint') {
    return theme.colors.indigo;
  }
  return theme.colors.ink;
}

export interface UpNextSectionProps {
  readonly lines: readonly DayLine[];
  readonly onOpen: (line: DayLine) => void;
}

/** EF-2, EF-6 — the rest of the day. */
export function UpNextSection({ lines, onOpen }: UpNextSectionProps) {
  return (
    <View style={styles.section} testID="up-next">
      <Text variant="sectionTitle">{t.upNext}</Text>
      <Card padded={false}>
        {lines.map((line, index) => (
          <Pressable
            key={line.id}
            testID={`up-next-${line.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${line.time}, ${line.title}, ${line.status}`}
            onPress={() => {
              onOpen(line);
            }}
            style={({ pressed }) => [
              styles.row,
              index > 0 ? styles.divider : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text variant="title" style={styles.time}>
              {line.time}
            </Text>
            <View style={[styles.dot, { backgroundColor: dotColorOf(line) }]} />
            <View style={styles.body}>
              <Text variant="rowTitle" numberOfLines={1}>
                {line.title}
              </Text>
              <Text variant="rowSubtitle" tone="muted" numberOfLines={1}>
                {line.detail}
              </Text>
            </View>
            <Text variant="caption" tone={line.state === 'missed' ? 'danger' : 'muted'}>
              {line.status}
            </Text>
            <Icon name="chevronRight" size={16} color={theme.colors.inkMuted} />
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: theme.controls.row,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: theme.colors.divider },
  pressed: { backgroundColor: theme.colors.surfaceSubtle },
  time: { width: 52 },
  dot: { width: 8, height: 8, borderRadius: radius.pill },
  body: { flex: 1, minWidth: 0, gap: 1 },
});
