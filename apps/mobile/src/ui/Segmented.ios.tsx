// iOS segmented control (SPEC-3002 EF-2): grey track, white selected pill with a soft shadow.
import { StyleSheet } from 'react-native';

import { theme } from '../theme';

import { SegmentedBase, type SegmentedSkin } from './Segmented.shared';
import type { SegmentedProps } from './Segmented.types';

const styles = StyleSheet.create({
  container: {
    gap: 2,
    padding: 3,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surfaceMuted,
  },
  option: { borderRadius: theme.radius.control },
  selected: {
    backgroundColor: theme.colors.surface,
    ...theme.elevation.card,
  },
});

const SKIN: SegmentedSkin = {
  container: styles.container,
  option: styles.option,
  selectedOption: styles.selected,
  selectedLabel: 'primary',
  idleLabel: 'muted',
};

/** Segmented control of iOS. */
export function Segmented(props: SegmentedProps) {
  return <SegmentedBase {...props} skin={SKIN} />;
}
