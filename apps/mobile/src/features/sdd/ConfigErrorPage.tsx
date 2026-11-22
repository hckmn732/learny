// « Configuration invalide » screen (SPEC-3001 CL-2): lists the keys at fault, never a value.
import { ScrollView, StyleSheet, Text } from 'react-native';

import { fr } from '@learny/i18n';

import type { ConfigIssue } from '../../config';
import { theme } from '../../theme';

const t = fr.mobile.config;

export interface ConfigErrorPageProps {
  readonly missing: readonly string[];
  readonly invalid: readonly ConfigIssue[];
}

export function ConfigErrorPage({ missing, invalid }: ConfigErrorPageProps) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} testID="config-error">
      <Text
        style={styles.title}
        accessibilityRole="header"
        accessibilityLabel={t.title}
        testID="config-error-title"
      >
        {t.title}
      </Text>
      <Text style={styles.intro}>{t.intro}</Text>

      {missing.length === 0 ? null : (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t.missingTitle}
          </Text>
          {missing.map((key) => (
            <Text key={key} style={styles.key} testID={`config-missing-${key}`}>
              {key}
            </Text>
          ))}
        </>
      )}

      {invalid.length === 0 ? null : (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t.invalidTitle}
          </Text>
          {invalid.map((issue) => (
            <Text
              key={`${issue.key}:${issue.message}`}
              style={styles.key}
              testID={`config-invalid-${issue.key}`}
            >
              {issue.key} — {issue.message}
            </Text>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  title: {
    ...theme.type.title,
    color: theme.colors['danger'],
  },
  intro: {
    ...theme.type.body,
    color: theme.colors['ink-secondary'],
  },
  sectionTitle: {
    ...theme.type.eyebrow,
    marginTop: theme.spacing.md,
    color: theme.colors.ink,
  },
  key: {
    ...theme.type.value,
    color: theme.colors.ink,
  },
});
