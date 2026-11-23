// Header of the Programme tab (SPEC-3202 EF-1; canevas § 3; design/app-mobile screen 03).
//
// Over-title = name of the formation, a button that opens « Changer de formation » (BR-FOR-11),
// title « Programme », and the creation action: a « + » in the header on iOS, a FAB on Android
// (ADR-3003 § 3, canevas § 3). The header reuses the large-title header of SPEC-3002 instead of
// duplicating the platform chrome.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { controls, theme } from '../../theme';
import { IconButton } from '../../ui/IconButton';
import { LargeTitleHeader } from '../../ui/LargeTitleHeader';

const t = fr.mobile.programme;

export interface ProgrammeHeaderProps {
  readonly formation: string;
  /** False when the learner owns a single formation: no chevron, no switcher (CL-3). */
  readonly canSwitch: boolean;
  readonly onSwitch: () => void;
  /** iOS only: the creation action of the header. */
  readonly onNewFormation?: () => void;
  readonly testID?: string;
}

/** Large title header of the Programme tab. */
export function ProgrammeHeader({
  formation,
  canSwitch,
  onSwitch,
  onNewFormation,
  testID = 'programme-header',
}: ProgrammeHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top }}>
      <LargeTitleHeader
        title={t.title}
        eyebrow={formation}
        {...(canSwitch
          ? { eyebrowAction: onSwitch, eyebrowActionLabel: t.switcherLabel, eyebrowChevron: true }
          : {})}
        {...(onNewFormation === undefined
          ? {}
          : {
              actions: (
                <IconButton
                  testID="programme-header-new"
                  name="plus"
                  accessibilityLabel={t.newFormation}
                  onPress={onNewFormation}
                />
              ),
            })}
        testID={testID}
      />
    </View>
  );
}

/** Space the Android FAB keeps from the bottom of the scene (above the navigation bar). */
export const PROGRAMME_FAB_BOTTOM = theme.spacing.xl;
/** Bottom padding of the list so the FAB never covers the resume button (EF-1, CA-1). */
export const PROGRAMME_FAB_CLEARANCE = PROGRAMME_FAB_BOTTOM + controls.fab + theme.spacing.lg;

export const programmeStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: {
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: PROGRAMME_FAB_CLEARANCE,
  },
  fab: { position: 'absolute', right: theme.spacing.xl, bottom: PROGRAMME_FAB_BOTTOM },
});
