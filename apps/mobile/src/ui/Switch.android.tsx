// Android switch (SPEC-3002 EF-2): the native `SwitchCompat`, indigo when on (Material 3).
import { Switch as RNSwitch, StyleSheet } from 'react-native';

import { theme } from '../theme';

import { SwitchRow } from './Switch.shared';
import type { SwitchProps } from './Switch.types';

/** Native switch of Android. */
export function Switch({
  label,
  value,
  onValueChange,
  description,
  disabled = false,
  testID,
}: SwitchProps) {
  return (
    <SwitchRow
      label={label}
      {...(description === undefined ? {} : { description })}
      disabled={disabled}
      {...(testID === undefined ? {} : { testID })}
    >
      <RNSwitch
        testID={testID === undefined ? undefined : `${testID}-control`}
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.indigo }}
        thumbColor={theme.colors.white}
        style={styles.control}
      />
    </SwitchRow>
  );
}

const styles = StyleSheet.create({
  control: { flexShrink: 0 },
});
