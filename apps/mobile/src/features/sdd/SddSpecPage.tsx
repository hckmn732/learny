// Demonstration page of SPEC-3001 (EF-2, § 10 `demo`). Presentational only: the route feeds it
// the configuration, the clock, the platform and the result of `GET /api/v1/health`.
import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import type { HealthCheck } from '../../api/health';
import { transitionDuration, useReducedMotion } from '../../lib/motion';
import { theme } from '../../theme';

const t = fr.mobile.sdd.spec3001;

/** Health shown by the page: the client result, or `checking` while the request is in flight. */
export type HealthDisplay = HealthCheck | { readonly status: 'checking' };

export interface SddSpecPageProps {
  readonly appVersion: string;
  readonly runtimeVersion: string;
  readonly apiUrl: string;
  readonly clockLabel: string;
  readonly platform: string;
  readonly health: HealthDisplay;
}

function healthText(health: HealthDisplay): string {
  if (health.status === 'ok') return t.healthOk;
  if (health.status === 'unreachable') return t.healthUnreachable;
  return t.healthChecking;
}

function healthCode(health: HealthDisplay): string | null {
  return health.status === 'unreachable' ? health.code : null;
}

interface RowProps {
  readonly testID: string;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly figure?: boolean;
}

/** One labelled value: the label names the value for a screen reader (BR-PLA-03). */
function Row({ testID, label, value, detail, figure = false }: RowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} maxFontSizeMultiplier={theme.maxFontSizeMultiplier.heading}>
        {label}
      </Text>
      <Text
        testID={testID}
        style={[styles.rowValue, figure ? styles.rowFigure : null]}
        accessibilityRole="text"
        accessibilityLabel={`${label} : ${value}`}
      >
        {value}
      </Text>
      {detail === undefined ? null : <Text style={styles.rowDetail}>{detail}</Text>}
    </View>
  );
}

/** Page `/_dev/sdd/SPEC-3001`. */
export function SddSpecPage(props: SddSpecPageProps) {
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  // A stable animated value created once, without reading a ref during render (CL-5).
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const duration = transitionDuration(reduceMotion);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [opacity, reduceMotion]);

  const code = healthCode(props.health);

  return (
    <Animated.View style={[styles.root, { opacity }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          // The native status bar is not overlaid (canevas § 3): the content starts below it.
          {
            paddingTop: theme.spacing.xl + insets.top,
            paddingBottom: theme.spacing.xl + insets.bottom,
          },
        ]}
        accessibilityRole="none"
        testID="sdd-page"
      >
        <Text style={styles.eyebrow} maxFontSizeMultiplier={theme.maxFontSizeMultiplier.heading}>
          {t.eyebrow}
        </Text>
        <Text
          testID="sdd-title"
          style={styles.title}
          accessibilityRole="header"
          accessibilityLabel={t.title}
          maxFontSizeMultiplier={theme.maxFontSizeMultiplier.heading}
        >
          {t.title}
        </Text>

        <View style={styles.card}>
          <Row testID="sdd-version" label={t.versionLabel} value={props.appVersion} />
          <View style={styles.separator} />
          <Row testID="sdd-runtime" label={t.runtimeLabel} value={props.runtimeVersion} />
          <View style={styles.separator} />
          <Row testID="sdd-api-url" label={t.apiLabel} value={props.apiUrl} />
        </View>

        <View style={styles.card}>
          <Row testID="sdd-clock" label={t.clockLabel} value={props.clockLabel} figure />
          <View style={styles.separator} />
          <Row
            testID="sdd-health"
            label={t.healthLabel}
            value={healthText(props.health)}
            {...(code === null ? {} : { detail: `${t.healthCodeLabel} : ${code}` })}
          />
          <View style={styles.separator} />
          <Row testID="sdd-platform" label={t.platformLabel} value={props.platform} />
        </View>

        <Text style={styles.footer}>{t.footer}</Text>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  eyebrow: {
    ...theme.type.eyebrow,
    color: theme.colors['ink-muted'],
  },
  title: {
    ...theme.type.title,
    color: theme.colors.ink,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  row: {
    paddingVertical: theme.spacing.md,
    minHeight: theme.minTouchTarget.height,
    justifyContent: 'center',
  },
  rowLabel: {
    ...theme.type.meta,
    color: theme.colors['ink-muted'],
  },
  rowValue: {
    ...theme.type.value,
    marginTop: 2,
    color: theme.colors.ink,
  },
  rowFigure: {
    ...theme.type.figure,
  },
  rowDetail: {
    ...theme.type.detail,
    marginTop: 2,
    color: theme.colors['ink-secondary'],
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  footer: {
    ...theme.type.caption,
    color: theme.colors['ink-muted'],
  },
});
