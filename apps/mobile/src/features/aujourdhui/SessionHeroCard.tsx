// Card « Votre séance » of the Aujourd'hui screen (SPEC-3201 EF-2, CL-2, CL-5; BR-PRO-02, CA-5).
//
// The ink card of the mockup: lime kicker, hour, title, detail (module, attempt, threshold), lime
// progress bar of the day, hours done and planned, then the lime action and the outline
// « Plus tard ». The lime button starts the slot through the destination the view model resolved
// (`/reviser` for the global quiz, the web page of the slot otherwise, ADR-3002 § 3); offline only
// the global quiz stays startable (CL-5).
//
// Vertical rhythm of `design/app-mobile/assets/app.css`: `.hero` padding 20 (Android) / 22 (iOS),
// `.hero-title` margin-top 8, `.hero-meta` margin-top 6, `.hero .progress` margin-top 16,
// `.hero-foot` margin-top 7 and `.hero-actions` margin-top 18. The button keeps the 52 dp of
// BR-PLA-02 where the export draws 46 dp: the minimum touch target of the platform wins over the
// pixel of a decorative height (ADR-3003 § 3).
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { controls, radius, theme, verticalHitSlop } from '../../theme';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { ProgressBar } from '../../ui/ProgressBar';
import { Text } from '../../ui/Text';

import type { HeroModel } from './view-model';

const t = fr.mobile.today;

/** `app.css` `.hero` / `.app[data-p="android"] .hero`. */
const PADDING = { ios: 22, android: 20 } as const;

/** `app.css` `.hero-title`, `.hero-meta`, `.hero .progress`, `.hero-foot`, `.hero-actions`. */
const RHYTHM = { title: 8, meta: 6, progress: 16, foot: 7, actions: 18, actionGap: 8 } as const;

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
    <Card
      tone="ink"
      padded={false}
      testID="today-hero"
      style={{ padding: PADDING[theme.platform] }}
    >
      <View style={styles.head}>
        <Text variant="label" tone="limeInk" testID="today-hero-kicker">
          {t.heroKicker}
        </Text>
        <Text variant="heroTime" tone="onDarkSecondary" testID="today-hero-time">
          {hero.time}
        </Text>
      </View>

      <View
        testID="today-hero-label"
        accessible
        accessibilityLabel={hero.label}
        style={styles.texts}
      >
        <Text variant="heroTitle" tone="inverse" testID="today-hero-title">
          {hero.title}
        </Text>
        <Text
          variant="heroMeta"
          tone="onDarkMuted"
          numberOfLines={2}
          style={styles.meta}
          testID="today-hero-detail"
        >
          {hero.detail}
        </Text>
      </View>

      <View style={styles.progress}>
        <ProgressBar
          value={hero.progress}
          label={t.progressLabel}
          onDark
          testID="today-hero-progress"
        />
      </View>
      <View style={styles.figures}>
        <Text variant="statLabel" tone="onDarkMuted" testID="today-hero-done">
          {hero.doneLabel}
        </Text>
        <Text variant="statLabel" tone="onDarkMuted" testID="today-hero-planned">
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
    marginBottom: RHYTHM.title,
  },
  texts: { gap: 0 },
  meta: { marginTop: RHYTHM.meta },
  progress: { marginTop: RHYTHM.progress },
  figures: { flexDirection: 'row', justifyContent: 'space-between', marginTop: RHYTHM.foot },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: RHYTHM.actionGap,
    marginTop: RHYTHM.actions,
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
