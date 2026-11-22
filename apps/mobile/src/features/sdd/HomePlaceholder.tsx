// Landing screen of the installed application when the SDD pages are disabled (SPEC-3001 EF-1:
// the demo page is the only screen delivered by this specification).
import { StyleSheet, Text, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';

const t = fr.mobile.home;

export function HomePlaceholder() {
  return (
    <View style={styles.root} testID="home-placeholder">
      <Text style={styles.title} accessibilityRole="header">
        {t.placeholderTitle}
      </Text>
      <Text style={styles.body}>{t.placeholderBody}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
    padding: theme.spacing.xl,
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.ink,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.inkSecondary,
  },
});
