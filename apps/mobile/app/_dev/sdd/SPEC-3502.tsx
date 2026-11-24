// Page de démonstration `/_dev/sdd/SPEC-3502` (SPEC-3502 § 10, mode `demo`).
//
// Elle récapitule ce que la spécification prouve : les quatre budgets mesurés (ET-1), le résultat de
// l'audit d'accessibilité (ET-2), les builds et les fiches des stores (EF-3 à EF-5). Les valeurs sont
// celles de `evidence/SPEC-3502/{perf,a11y}.md` ; la page ne lit ni l'appareil ni le réseau, donc sa
// capture est reproductible et sert de ligne de base visuelle (ADR-3003 § 4).
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { theme } from '../../../src/theme';
import { Text } from '../../../src/ui';

const t = fr.mobile.sdd.spec3502;

interface RowProps {
  readonly testID: string;
  readonly label: string;
  readonly value: string;
}

/** Une ligne « libellé → valeur mesurée », annoncée d'un bloc par un lecteur d'écran. */
function Row({ testID, label, value }: RowProps) {
  return (
    <View style={styles.row}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text
        variant="body"
        testID={testID}
        accessibilityRole="text"
        accessibilityLabel={`${label} : ${value}`}
      >
        {value}
      </Text>
    </View>
  );
}

/** Route `/ _dev/sdd/SPEC-3502`. */
export default function Spec3502Route() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + theme.spacing.xl }]}
      testID="sdd-3502"
    >
      <Text variant="eyebrow" tone="muted">
        {t.eyebrow}
      </Text>
      <Text variant="largeTitle" accessibilityRole="header" testID="sdd-3502-title">
        {t.title}
      </Text>

      <View style={styles.card} testID="sdd-3502-budgets">
        <Text variant="sectionTitle">{t.budgetsTitle}</Text>
        <Row testID="sdd-3502-startup" label={t.startupLabel} value={t.startupValue} />
        <Row testID="sdd-3502-tap" label={t.tapLabel} value={t.tapValue} />
        <Row testID="sdd-3502-scroll" label={t.scrollLabel} value={t.scrollValue} />
        <Row testID="sdd-3502-size" label={t.sizeLabel} value={t.sizeValue} />
      </View>

      <View style={styles.card} testID="sdd-3502-audit">
        <Text variant="sectionTitle">{t.auditTitle}</Text>
        <Text variant="body" testID="sdd-3502-screens">
          {t.auditScreens}
        </Text>
        <Text variant="body" testID="sdd-3502-fixes">
          {t.auditFixes}
        </Text>
        <Text variant="caption" tone="muted" testID="sdd-3502-voiceover">
          {t.auditVoiceOver}
        </Text>
      </View>

      <View style={styles.card} testID="sdd-3502-builds">
        <Text variant="sectionTitle">{t.buildsTitle}</Text>
        <Text variant="body" testID="sdd-3502-build-production">
          {t.buildProduction}
        </Text>
        <Text variant="body" testID="sdd-3502-build-signed">
          {t.buildSigned}
        </Text>
        <Text variant="caption" tone="muted" testID="sdd-3502-build-channel">
          {t.buildChannel}
        </Text>
      </View>

      <View style={styles.card} testID="sdd-3502-store">
        <Text variant="sectionTitle">{t.storeTitle}</Text>
        <Text variant="body" testID="sdd-3502-store-appstore">
          {t.storeAppStore}
        </Text>
        <Text variant="body" testID="sdd-3502-store-play">
          {t.storePlay}
        </Text>
        <Text variant="caption" tone="muted" testID="sdd-3502-store-privacy">
          {t.storePrivacy}
        </Text>
      </View>

      <Text variant="caption" tone="muted" testID="sdd-3502-footer">
        {t.footer}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    backgroundColor: theme.colors.canvas,
  },
  card: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  row: { gap: 2 },
});
