// Card of the daily warm-up (SPEC-3201 EF-7, BR-AUT-03; SPEC-714 EF-7).
//
// « Échauffement · 3 questions · 2 min », shown before « À suivre » and only while the warm-up is
// still to do. The warm-up game itself belongs to SPEC-3305: until then the card opens the web page
// of the session it precedes (ADR-3002 § 3), exactly like the other screens that do not exist yet.
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Card } from '../../ui/Card';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

import type { WarmupCardModel } from './view-model';

const t = fr.mobile.today;

export interface WarmupCardProps {
  readonly warmup: WarmupCardModel;
  readonly onOpen: () => void;
}

/** EF-7 — the warm-up of the day. */
export function WarmupCard({ warmup, onOpen }: WarmupCardProps) {
  return (
    <Pressable
      testID="warmup-card"
      accessibilityRole="button"
      accessibilityLabel={`${warmup.title}. ${t.warmup.open}`}
      onPress={onOpen}
      style={({ pressed }) => [pressed ? styles.pressed : null]}
    >
      <Card>
        <View style={styles.row}>
          <View style={styles.tile}>
            <Icon name="flame" size={18} color={theme.colors.limeInk} />
          </View>
          <View style={styles.body}>
            <Text variant="title" testID="warmup-card-title">
              {warmup.title}
            </Text>
            <Text variant="rowSubtitle" tone="muted">
              {t.warmup.open}
            </Text>
          </View>
          <Icon name="arrowRight" size={18} color={theme.colors.inkMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  tile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
    backgroundColor: theme.colors.limeSoft,
  },
  body: { flex: 1, minWidth: 0, gap: 1 },
  pressed: { opacity: 0.9 },
});
