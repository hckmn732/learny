// Strength of the sign-up password (SPEC-3101 EF-2, BR-ACC-01; ADR-3003 § 2).
//
// Four bars and a hint, exactly like the web account form (`passwordStrength` of
// `@learny/contracts/password-strength`, shared by SPEC-3101). The bars are `aria-hidden` and the
// hint is announced, so a screen reader never reads four empty elements.
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

import { radius, spacing, theme } from '../../theme';
import { Text } from '../../ui/Text';

import { passwordStrength, strengthHint } from './validation';

export interface StrengthMeterProps {
  readonly password: string;
  readonly testID?: string | undefined;
}

/** Strength indicator of the sign-up form (EF-2). */
export function StrengthMeter({ password, testID }: StrengthMeterProps): ReactElement {
  const strength = passwordStrength(password);
  const barColor = strength >= 3 ? theme.colors.green : theme.colors.orange;

  return (
    <View style={styles.container}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.bars}
      >
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.bar,
              { backgroundColor: index < strength ? barColor : theme.colors.border },
            ]}
          />
        ))}
      </View>
      <View accessibilityLiveRegion="polite">
        <Text {...(testID === undefined ? {} : { testID })} tone="muted" variant="caption">
          {strengthHint(password)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderRadius: radius.badge, flex: 1, height: 4 },
  bars: { flexDirection: 'row', gap: spacing.xs },
  container: { gap: spacing.sm },
});
