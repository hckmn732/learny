// Rail of the games of the session (SPEC-3305 EF-2, BR-MEM-08; ADR-3003 § 2).
//
// One chip per game: the notion label and its status (« Fait », « En cours », « À venir »). The rail
// is horizontal and scrolls; the current chip is announced as the current step of the session.
import { ScrollView, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Text } from '../../ui/Text';

import type { RailEntry } from './session-state';

const t = fr.mobile.reviser;

export interface ReviewRailProps {
  readonly entries: readonly RailEntry[];
}

/** Horizontal rail of the games (EF-2). */
export function ReviewRail({ entries }: ReviewRailProps) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
      testID="review-rail"
      accessibilityLabel={t.rail.label}
    >
      {entries.map((entry) => {
        const done = entry.status === 'done';
        const current = entry.status === 'current';
        return (
          <View
            key={entry.position}
            accessibilityLabel={`${entry.label}. ${t.rail.status[entry.status]}`}
            accessibilityState={{ selected: current }}
            style={[styles.chip, done ? styles.done : null, current ? styles.current : null]}
            testID={`review-rail-${String(entry.position)}`}
          >
            <Text
              variant="chip"
              tone={done ? 'success' : current ? 'primary' : 'muted'}
              numberOfLines={1}
            >
              {entry.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xl },
  chip: {
    maxWidth: 180,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  done: { backgroundColor: theme.colors.greenSoft, borderColor: theme.colors.greenSoft },
  current: { backgroundColor: theme.colors.limeSoft, borderColor: theme.colors.lime },
});
