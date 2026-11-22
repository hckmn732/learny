// Shared behaviour of the segmented control: selection, grouping roles and haptics. The skin
// (track, selected pill, dividers) is the only part that differs between iOS and Android
// (ADR-3004 § 5), and it is passed by the platform file.
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { selectionFeedback } from '../lib/haptics';
import { theme } from '../theme';

import { segmentTestID, type SegmentedOption, type SegmentedProps } from './Segmented.types';
import { Text } from './Text';

export interface SegmentedSkin {
  readonly container: StyleProp<ViewStyle>;
  readonly option: StyleProp<ViewStyle>;
  readonly selectedOption: StyleProp<ViewStyle>;
  readonly separator?: StyleProp<ViewStyle>;
  readonly selectedLabel: 'primary' | 'indigoInk';
  readonly idleLabel: 'muted';
}

export interface SegmentedBaseProps extends SegmentedProps {
  readonly skin: SegmentedSkin;
}

/** Segmented control announced as a tab list (ET-6). */
export function SegmentedBase({
  options,
  value,
  onChange,
  label,
  disabled = false,
  testID,
  skin,
}: SegmentedBaseProps) {
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[styles.container, skin.container]}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <View key={option.value} style={styles.slot}>
            {index === 0 ? null : <View style={[styles.separator, skin.separator]} />}
            <Pressable
              testID={segmentTestID(testID, option)}
              accessibilityRole="tab"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (selected || disabled) return;
                selectionFeedback();
                onChange(option.value);
              }}
              style={[styles.option, skin.option, selected ? skin.selectedOption : null]}
            >
              <Text
                variant="chip"
                tone={selected ? skin.selectedLabel : skin.idleLabel}
                numberOfLines={2}
                align="center"
                style={styles.label}
              >
                {option.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignSelf: 'stretch' },
  slot: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch' },
  option: {
    flex: 1,
    minHeight: theme.minTouchTarget.height,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  separator: { width: StyleSheet.hairlineWidth },
  label: { maxWidth: '100%' },
});

export type { SegmentedOption };
