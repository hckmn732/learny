// Avatar (SPEC-3002 EF-2): initials of the account on the indigo disc of the mockups.
import { StyleSheet, View } from 'react-native';

import { controls, theme } from '../theme';

import { Text } from './Text';

export interface AvatarProps {
  readonly initials: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly testID?: string;
}

/** Round avatar of the profile and of the tutor answers. */
export function Avatar({ initials, size = 'md', testID }: AvatarProps) {
  const dimension = controls.avatar[size];
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="image"
      accessibilityLabel={initials}
      style={[styles.base, { width: dimension, height: dimension }]}
    >
      <Text variant={size === 'lg' ? 'sectionTitle' : 'chip'} tone="inverse" numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigo,
  },
});
