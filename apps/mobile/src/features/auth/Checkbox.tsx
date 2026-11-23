// Acceptance case of the sign-up form (SPEC-3101 EF-2, BR-ACC-02; ADR-3003 § 2).
//
// Never pre-checked, announced as a checkbox, and its label is the complete sentence: the button
// of the form stays inactive until it is checked (BR-ACC-02).
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, theme, touchTarget } from '../../theme';
import { Text } from '../../ui/Text';

export interface CheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly error?: string | null;
  readonly disabled?: boolean;
  readonly testID?: string | undefined;
}

/** Single case of the design system. */
export function Checkbox({
  label,
  checked,
  onChange,
  error,
  disabled = false,
  testID,
}: CheckboxProps): ReactElement {
  const hidden = error !== null && error !== undefined;
  return (
    <View style={styles.container}>
      <Pressable
        {...(testID === undefined ? {} : { testID })}
        accessibilityLabel={hidden ? `${label}. ${error}` : label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => {
          onChange(!checked);
        }}
        style={styles.row}
      >
        <View
          style={[styles.box, checked ? styles.boxChecked : null, hidden ? styles.boxError : null]}
        >
          {checked ? (
            <Text tone="inverse" variant="caption">
              ✓
            </Text>
          ) : null}
        </View>
        <Text style={styles.label} variant="bodySmall">
          {label}
        </Text>
      </Pressable>
      {hidden ? (
        <View accessibilityLiveRegion="polite">
          <Text tone="danger" variant="caption">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderStrong,
    borderRadius: radius.badge,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  boxChecked: { backgroundColor: theme.colors.ink, borderColor: theme.colors.ink },
  boxError: { borderColor: theme.colors.danger },
  container: { gap: spacing.sm },
  label: { flex: 1 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: touchTarget.height,
  },
});
