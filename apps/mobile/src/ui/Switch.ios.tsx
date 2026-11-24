// iOS switch (SPEC-3002 EF-2): the native `UISwitch`, lime when on, as the mockup draws it.
import { Switch as RNSwitch, StyleSheet } from 'react-native';

import { theme } from '../theme';

import { SwitchRow } from './Switch.shared';
import type { SwitchProps } from './Switch.types';

/** Native switch of iOS. */
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
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.lime }}
        ios_backgroundColor={theme.colors.borderStrong}
        thumbColor={theme.colors.white}
        style={styles.control}
      />
    </SwitchRow>
  );
}

const styles = StyleSheet.create({
  control: { flexShrink: 0 },
});
