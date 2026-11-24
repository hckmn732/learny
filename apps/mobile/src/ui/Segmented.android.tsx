// Android segmented buttons (SPEC-3002 EF-2): white pill container, dividers and an indigo-soft
// selected segment (Material 3 expressive).
import { StyleSheet } from 'react-native';

import { theme } from '../theme';

import { SegmentedBase, type SegmentedSkin } from './Segmented.shared';
import type { SegmentedProps } from './Segmented.types';

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  option: { minHeight: theme.minTouchTarget.height },
  selected: { backgroundColor: theme.colors.indigoSoft },
  separator: { backgroundColor: theme.colors.borderStrong },
});

const SKIN: SegmentedSkin = {
  container: styles.container,
  option: styles.option,
  selectedOption: styles.selected,
  separator: styles.separator,
  selectedLabel: 'indigoInk',
  idleLabel: 'muted',
};

/** Segmented buttons of Android. */
export function Segmented(props: SegmentedProps) {
  return <SegmentedBase {...props} skin={SKIN} />;
}
