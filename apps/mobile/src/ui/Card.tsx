// Card (SPEC-3002 EF-2): white card of radius 22 (EF-1) or ink card of the tutor answer.
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { theme } from '../theme';

export type CardTone = 'surface' | 'ink';

export interface CardProps {
  readonly children: ReactNode;
  readonly tone?: CardTone;
  /** Inner padding of the card (18 pt on iOS, 16 pt on Android in the mockups). */
  readonly padded?: boolean;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/** Surface that groups related content. */
export function Card({ children, tone = 'surface', padded = true, testID, style }: CardProps) {
  const dark = tone === 'ink';
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      style={[
        styles.base,
        dark ? styles.ink : styles.surface,
        padded ? styles.padded : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: theme.radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  surface: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    ...theme.elevation.card,
  },
  ink: {
    backgroundColor: theme.colors.ink,
    borderColor: theme.colors.ink,
    borderRadius: theme.radius.card,
  },
  padded: {
    padding: theme.platform === 'ios' ? 18 : 16,
  },
});
