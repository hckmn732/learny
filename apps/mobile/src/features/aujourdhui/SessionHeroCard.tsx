// Card « Votre séance » of the Aujourd'hui screen (SPEC-3201 EF-2, CL-2, CL-5; BR-PRO-02).
//
// The ink card of the mockup: lime kicker, hour, title, detail (module, attempt, threshold), lime
// progress bar of the day, hours done and planned, then the lime action and the outline
// « Plus tard ». The lime button starts the slot through the destination the view model resolved
// (`/reviser` for the global quiz, the web page of the slot otherwise, ADR-3002 § 3); offline only
// the global quiz stays startable (CL-5).
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { controls, radius, theme, verticalHitSlop } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ProgressBar } from '../../ui/ProgressBar';
import { Text } from '../../ui/Text';

import type { HeroModel } from './view-model';

const t = fr.mobile.today;

export interface SessionHeroCardProps {
  readonly hero: HeroModel;
  /** CL-5 — false offline: the mutations wait for the network. */
  readonly online: boolean;
  readonly onStart: () => void;
  readonly onLater: () => void;
  readonly startDisabled?: boolean;
}

/** EF-2 — the session of the day, highlighted above every other card. */
export function SessionHeroCard({
  hero,
  online,
  onStart,
  onLater,
  startDisabled = false,
}: SessionHeroCardProps) {
  const startable = online || hero.startableOffline;
  return (
    <Card tone="ink" testID="today-hero">
      <View style={styles.head}>
        <Text variant="label" tone="limeInk" testID="today-hero-kicker">
          {t.heroKicker}
        </Text>
        <Text variant="title" tone="inverse" testID="today-hero-time">
          {hero.time}
        </Text>
      </View>

      <View
        testID="today-hero-label"
        accessible
        accessibilityLabel={hero.label}
        style={styles.texts}
      >
        <Text variant="sectionTitle" tone="inverse" testID="today-hero-title">
          {hero.title}
        </Text>
        <Text variant="bodySmall" tone="onDarkMuted" numberOfLines={2} testID="today-hero-detail">
          {hero.detail}
        </Text>
      </View>

      <ProgressBar
        value={hero.progress}
        label={t.progressLabel}
        onDark
        testID="today-hero-progress"
      />
      <View style={styles.figures}>
        <Text variant="caption" tone="onDarkMuted" testID="today-hero-done">
          {hero.doneLabel}
        </Text>
        <Text variant="caption" tone="onDarkMuted" testID="today-hero-planned">
          {hero.plannedLabel}
        </Text>
      </View>

      <View style={styles.actions}>
        <View style={styles.grow}>
          <Button
            label={hero.actionLabel}
            testID="today-hero-start"
            block
            disabled={!startable || startDisabled}
            accessibilityHint={startable ? undefined : t.actions.offline}
            onPress={onStart}
          />
        </View>
        <Pressable
          testID="today-hero-later"
          accessibilityRole="button"
          accessibilityLabel={t.later}
          accessibilityState={{ disabled: !online }}
          disabled={!online}
          onPress={onLater}
          hitSlop={verticalHitSlop(controls.button.md)}
          style={({ pressed }) => [styles.later, { opacity: online ? (pressed ? 0.85 : 1) : 0.45 }]}
        >
          <Text variant="button" tone="inverse">
            {t.later}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  texts: { gap: theme.spacing.xs },
  figures: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -theme.spacing.xs },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  grow: { flex: 1 },
  later: {
    minHeight: controls.button.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.onDarkSecondary,
  },
});
