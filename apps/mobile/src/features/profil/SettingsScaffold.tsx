// Moule des écrans de la pile Profil (SPEC-3401 EF-3 ; canevas § 3).
//
// Every stacked screen of the Profil tab shares one geometry: a back chevron and the eyebrow of the
// screen, a scrollable body, and an optional footer that holds the « Enregistrer » action. Leaving
// a screen with unsaved changes asks for a confirmation first (EF-3), on the back chevron and on
// the Android system gesture.
import { useCallback, useEffect, type ReactNode } from 'react';
import { Alert, BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Text } from '../../ui/Text';

const t = fr.mobile.profile;

/**
 * Confirmation of a screen left with unsaved changes (EF-3) : answers the handler to call. The
 * Android back gesture is intercepted only while the form is dirty, so an untouched screen keeps
 * the native behaviour.
 */
export function useUnsavedGuard(dirty: boolean, leave: () => void): () => void {
  const request = useCallback(() => {
    if (!dirty) {
      leave();
      return;
    }
    Alert.alert(t.unsavedTitle, t.unsavedBody, [
      { text: t.unsavedStay, style: 'cancel' },
      { text: t.unsavedLeave, style: 'destructive', onPress: leave },
    ]);
  }, [dirty, leave]);

  useEffect(() => {
    if (!dirty) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      request();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [dirty, request]);

  return request;
}

export interface SettingsScaffoldProps {
  readonly title: string;
  readonly testID: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
  /** Footer action, typically the save button of EF-3. */
  readonly footer?: ReactNode;
  /** Extra line under the title (the « brouillon » hint of a dirty form). */
  readonly subtitle?: string;
  readonly scrollTestID?: string;
}

/** Body of a stacked settings screen. */
export function SettingsScaffold({
  title,
  testID,
  onBack,
  children,
  footer,
  subtitle,
  scrollTestID,
}: SettingsScaffoldProps) {
  return (
    <View style={styles.screen} testID={testID}>
      <View style={styles.nav}>
        <IconButton
          name="chevronLeft"
          accessibilityLabel={t.back}
          onPress={onBack}
          testID={`${testID}-back`}
        />
        <Text variant="eyebrow" tone="muted">
          {title}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        {...(scrollTestID === undefined ? {} : { testID: scrollTestID })}
      >
        {subtitle === undefined ? null : (
          <Text variant="rowSubtitle" tone="muted">
            {subtitle}
          </Text>
        )}
        {children}
      </ScrollView>
      {footer === undefined ? null : <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

export interface SaveFooterProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** « Enregistrer » of EF-3: active only when the form changed, never while offline (CL-4). */
export function SaveFooter({
  label,
  onPress,
  dirty,
  pending,
  disabled = false,
  testID = 'settings-save',
}: SaveFooterProps) {
  return (
    <View style={styles.saveRow}>
      <Button
        label={pending ? fr.mobile.profile.saving : label}
        onPress={onPress}
        loading={pending}
        disabled={!dirty || disabled}
        block
        testID={testID}
      />
    </View>
  );
}

/** Card that groups the switches and fields of one section. */
export function SettingsSection({
  title,
  hint,
  children,
  testID,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.section}>
      <Text variant="sectionTitle">{title}</Text>
      {hint === undefined ? null : (
        <Text variant="rowSubtitle" tone="muted">
          {hint}
        </Text>
      )}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  content: {
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.surface,
  },
  saveRow: { gap: theme.spacing.sm },
  section: { gap: theme.spacing.xs },
  sectionBody: { gap: theme.spacing.sm, paddingTop: theme.spacing.sm },
});
