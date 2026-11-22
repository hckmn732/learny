// `/_dev/ui` — component gallery of the mobile track (SPEC-3002 EF-3 and § 10, ADR-0131). Test
// builds only: without `EXPO_PUBLIC_ENABLE_SDD_PAGES` the route sends the user home. Every
// component appears in all its states; the platform selector is a disabled segmented control
// because the real platform applies.
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { configResult } from '../../src/config';
import { theme } from '../../src/theme';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Fab,
  Icon,
  IconButton,
  LargeTitleHeader,
  ListGroupHeader,
  ListRow,
  ProgressBar,
  Segmented,
  Sheet,
  Skeleton,
  StatCard,
  Switch,
  Text,
  Toast,
} from '../../src/ui';

const t = fr.mobile.ui.gallery;

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <View testID={`ui-section-${id}`} style={styles.section}>
      <Text variant="sectionTitle">{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Colour, typography, radius and spacing tokens of the theme (EF-3). */
function TokensSection() {
  const swatches: readonly {
    readonly name: string;
    readonly value: string;
    readonly label: string;
  }[] = [
    { name: 'canvas', value: theme.colors.canvas, label: t.tokens.colors },
    { name: 'ink', value: theme.colors.ink, label: t.tokens.colors },
    { name: 'lime', value: theme.colors.lime, label: t.tokens.colors },
    { name: 'indigo', value: theme.colors.indigo, label: t.tokens.colors },
    { name: 'orange', value: theme.colors.orange, label: t.tokens.colors },
    { name: 'green', value: theme.colors.green, label: t.tokens.colors },
  ];
  return (
    <Section id="tokens" title={t.sections.tokens}>
      <Text variant="label" tone="muted">
        {t.tokens.colors}
      </Text>
      <View style={styles.swatches}>
        {swatches.map((swatch) => (
          <View key={swatch.name} testID={`ui-token-${swatch.name}`} style={styles.swatch}>
            <View style={[styles.swatchChip, { backgroundColor: swatch.value }]} />
          </View>
        ))}
      </View>
      <Text variant="label" tone="muted">
        {t.tokens.typography}
      </Text>
      <Text variant="largeTitle">Aa 34</Text>
      <Text variant="sectionTitle">Aa 20</Text>
      <Text variant="body">Aa 16</Text>
      <Text variant="label">Aa 12</Text>
      <Text variant="label" tone="muted">
        {t.tokens.radii}
      </Text>
      <View style={styles.radii}>
        {[theme.radius.card, theme.radius.option, theme.radius.control].map((value) => (
          <View
            key={value}
            style={[styles.radiusChip, { borderRadius: value }]}
            testID={`ui-radius-${String(value)}`}
          />
        ))}
      </View>
      <Text variant="label" tone="muted">
        {t.tokens.spacing}
      </Text>
      <View style={styles.spacings}>
        {[
          theme.spacing.xs,
          theme.spacing.sm,
          theme.spacing.md,
          theme.spacing.lg,
          theme.spacing.xl,
        ].map((value) => (
          <View key={value} style={[styles.spacingChip, { width: value }]} />
        ))}
      </View>
    </Section>
  );
}

export default function UiGalleryRoute() {
  const [view, setView] = useState('week');
  const [notifications, setNotifications] = useState(true);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  if (!configResult.ok || !configResult.config.enableSddPages) return <Redirect href="/" />;

  return (
    <View style={styles.root}>
      <ScrollView
        testID="ui-gallery"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitleHeader eyebrow={t.eyebrow} title={t.title} testID="ui-header" />
        <Text variant="bodySmall" tone="secondary" style={styles.intro}>
          {t.intro}
        </Text>

        <View style={styles.platformBlock}>
          <Segmented
            options={[
              { value: 'ios', label: 'iOS' },
              { value: 'android', label: 'Android' },
            ]}
            value={theme.platform}
            onChange={() => undefined}
            label={t.platform}
            disabled
            testID="ui-platform"
          />
          <Text variant="caption" tone="muted">
            {t.platformNote}
          </Text>
        </View>

        <TokensSection />

        <Section id="boutons" title={t.sections.buttons}>
          <Button label={t.labels.primary} onPress={() => undefined} testID="ui-button-primary" />
          <Button
            label={t.labels.secondary}
            variant="ink"
            onPress={() => undefined}
            testID="ui-button-ink"
          />
          <Button
            label={t.labels.outline}
            variant="outline"
            onPress={() => undefined}
            testID="ui-button-outline"
          />
          <Button
            label={t.labels.text}
            variant="text"
            onPress={() => undefined}
            testID="ui-button-text"
          />
          <Button
            label={t.labels.small}
            size="sm"
            onPress={() => undefined}
            testID="ui-button-small"
          />
          <Button
            label={t.labels.loading}
            loading
            onPress={() => undefined}
            testID="ui-button-loading"
          />
          <Button
            label={t.labels.disabledButton}
            disabled
            onPress={() => undefined}
            testID="ui-button-disabled"
          />
          <View style={styles.row}>
            <IconButton
              name="bell"
              accessibilityLabel={t.labels.badge}
              onPress={() => undefined}
              dot
              testID="ui-icon-button"
            />
            <IconButton
              name="search"
              accessibilityLabel={t.labels.chipOutline}
              variant="plain"
              onPress={() => undefined}
              testID="ui-icon-button-plain"
            />
          </View>
        </Section>

        <Section id="cartes" title={t.sections.cards}>
          <View style={styles.row}>
            <StatCard
              label={t.labels.statStreak}
              value="12"
              unit="j"
              icon="flame"
              testID="ui-stat-streak"
            />
            <StatCard
              label={t.labels.statRetention}
              value="86"
              unit="%"
              icon="target"
              tone="lime"
              testID="ui-stat-retention"
            />
          </View>
          <Card testID="ui-card-surface">
            <Text variant="sectionTitle">{t.labels.rowCourse}</Text>
            <Text variant="bodySmall" tone="secondary">
              {t.labels.rowCourseSub}
            </Text>
          </Card>
          <Card tone="ink" testID="ui-card-ink">
            <Text variant="sectionTitle" tone="inverse">
              {t.labels.sheetTitle}
            </Text>
            <Text variant="bodySmall" tone="onDarkSecondary">
              {t.labels.sheetBody}
            </Text>
          </Card>
          <View style={styles.chips}>
            <Chip label={t.labels.chipNeutral} testID="ui-chip-neutral" />
            <Chip label={t.labels.chipLime} tone="lime" testID="ui-chip-lime" icon="play" />
            <Chip
              label={t.labels.chipIndigo}
              tone="indigo"
              testID="ui-chip-indigo"
              icon="sparkles"
            />
            <Chip label={t.labels.chipGreen} tone="green" testID="ui-chip-green" icon="check" />
            <Chip label={t.labels.chipOrange} tone="orange" testID="ui-chip-orange" icon="alert" />
            <Chip
              label={t.labels.chipOutline}
              tone="outline"
              onPress={() => undefined}
              testID="ui-chip-outline"
            />
          </View>
        </Section>

        <Section id="controles" title={t.sections.controls}>
          <Segmented
            options={[
              { value: 'day', label: t.labels.day },
              { value: 'week', label: t.labels.week },
              { value: 'month', label: t.labels.month },
            ]}
            value={view}
            onChange={setView}
            label={t.labels.segmentedLabel}
            testID="ui-segmented"
          />
          <Text variant="caption" tone="muted" testID="ui-segmented-value">
            {view}
          </Text>
          <Switch
            label={t.labels.switchLabel}
            description={t.labels.switchDescription}
            value={notifications}
            onValueChange={setNotifications}
            testID="ui-switch"
          />
          <Text variant="caption" tone="muted" testID="ui-switch-value">
            {notifications ? t.labels.switchOn : t.labels.switchOff}
          </Text>
          <ProgressBar value={0.38} label={t.labels.progressLabel} testID="ui-progress-linear" />
          <ProgressBar
            value={0.4}
            label={t.labels.segmentsLabel}
            variant="segments"
            segments={5}
            current={2}
            testID="ui-progress-segments"
          />
        </Section>

        <Section id="listes" title={t.sections.lists}>
          <ListGroupHeader title={t.labels.groupHeader} testID="ui-group-header" />
          <Card padded={false} testID="ui-list">
            <ListRow
              title={t.labels.rowCourse}
              subtitle={t.labels.rowCourseSub}
              icon="book"
              onPress={() => undefined}
              testID="ui-row-course"
            />
            <ListRow
              title={t.labels.switchLabel}
              subtitle={t.labels.switchDescription}
              icon="bell"
              separator
              trailing={
                <Switch
                  label={t.labels.switchLabel}
                  value={notifications}
                  onValueChange={setNotifications}
                  testID="ui-row-switch"
                />
              }
              testID="ui-row-notifications"
            />
            <ListRow
              title={t.labels.chipIndigo}
              icon="sparkles"
              onPress={() => undefined}
              testID="ui-row-tutor"
            />
          </Card>
          <View style={styles.row}>
            <Avatar initials="AP" testID="ui-avatar" />
            <Badge count={3} accessibilityLabel={t.labels.badge} testID="ui-badge" />
            <Fab
              icon="plus"
              accessibilityLabel={t.labels.fab}
              onPress={() => undefined}
              testID="ui-fab"
            />
          </View>
        </Section>

        <Section id="feuilles" title={t.sections.overlays}>
          <Banner
            tone="offline"
            description={fr.mobile.ui.offlineBody}
            testID="ui-banner-offline"
          />
          <Banner
            tone="info"
            title={t.labels.chipIndigo}
            description={t.labels.sheetBody}
            testID="ui-banner-info"
          />
          <View style={styles.row}>
            <Button
              label={t.actions.showToast}
              variant="outline"
              size="sm"
              onPress={() => {
                setToastVisible(true);
              }}
              testID="ui-toast-trigger"
            />
            <Button
              label={t.actions.openSheet}
              variant="outline"
              size="sm"
              onPress={() => {
                setSheetVisible(true);
              }}
              testID="ui-sheet-open"
            />
          </View>
        </Section>

        <Section id="etats" title={t.sections.states}>
          <EmptyState
            title={t.labels.emptyTitle}
            description={t.labels.emptyBody}
            action={{ label: t.labels.emptyAction, onPress: () => undefined }}
            testID="ui-empty"
          />
          <ErrorState
            description={t.labels.emptyBody}
            onRetry={() => undefined}
            testID="ui-error"
          />
          <Skeleton lines={3} animated={false} testID="ui-skeleton" />
        </Section>
      </ScrollView>

      <View pointerEvents="box-none" style={styles.toastHost} testID="ui-toast-host">
        <Toast
          visible={toastVisible}
          duration={12000}
          message={t.labels.toast}
          onHide={() => {
            setToastVisible(false);
          }}
          testID="ui-toast"
        />
      </View>

      <Sheet
        visible={sheetVisible}
        onClose={() => {
          setSheetVisible(false);
        }}
        title={t.labels.sheetTitle}
        testID="ui-sheet"
      >
        <Text variant="rowSubtitle" tone="secondary">
          {t.labels.sheetBody}
        </Text>
        <View style={styles.row}>
          <Icon name="flame" size={20} color={theme.colors.orange} />
          <Text variant="rowTitle">{t.labels.statStreak}</Text>
        </View>
        <Button
          label={fr.mobile.ui.close}
          onPress={() => {
            setSheetVisible(false);
          }}
          testID="ui-sheet-close"
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.canvas },
  toastHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: theme.spacing.xxxl,
    alignItems: 'center',
  },
  content: { paddingBottom: theme.spacing.huge, gap: theme.spacing.md },
  intro: { paddingHorizontal: theme.spacing.xl },
  platformBlock: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.xs },
  section: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  sectionBody: { gap: theme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  swatches: { flexDirection: 'row', gap: theme.spacing.sm },
  swatch: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  swatchChip: {
    width: '100%',
    height: 44,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  radii: { flexDirection: 'row', gap: theme.spacing.md },
  radiusChip: {
    width: 56,
    height: 56,
    backgroundColor: theme.colors.limeSoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  spacings: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm },
  spacingChip: {
    height: 32,
    backgroundColor: theme.colors.indigoSoft,
    borderRadius: theme.radius.badge,
  },
});
