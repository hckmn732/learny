// Row layout shared by the two switches: label, optional description and the control itself.
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

import { Text } from './Text';

export interface SwitchRowProps {
  readonly label: string;
  readonly description?: string;
  readonly disabled: boolean;
  readonly testID?: string;
  readonly children: React.ReactElement;
}

/** Label and description of a settings row, with the native control on the trailing edge. */
export function SwitchRow({ label, description, disabled, testID, children }: SwitchRowProps) {
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.row}>
      <View style={styles.texts}>
        <Text variant="rowTitle" tone={disabled ? 'muted' : 'primary'}>
          {label}
        </Text>
        {description === undefined ? null : (
          <Text variant="rowSubtitle" tone="muted">
            {description}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    minHeight: theme.minTouchTarget.height,
    paddingVertical: theme.spacing.sm,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
