// Group of the connected screens (SPEC-3101 EF-7; SPEC-3102 EF-1, EF-6, EF-8).
//
// The shell of the five tabs, behind the onboarding guard (BR-ACC-04): the offline band of
// SPEC-3003 above every screen of the tabs, then `AppTabs`. The deep links are resolved here,
// once the authentication guard and the onboarding guard have let the learner in.
import { StyleSheet, View } from 'react-native';

import { OnboardingGuard } from '../../src/features/shell/OnboardingGuard';
import { AppTabs } from '../../src/navigation/AppTabs';
import { useDeepLinkNavigation } from '../../src/navigation/use-deep-links';
import { OfflineBanner } from '../../src/offline/OfflineBanner';
import { theme } from '../../src/theme';

/** First tab of the shell and root of the back behaviour (EF-1, CL-5). */
export const unstable_settings = { initialRouteName: 'aujourdhui' };

export default function AppGroupLayout() {
  useDeepLinkNavigation();

  return (
    <OnboardingGuard>
      <View style={styles.base}>
        <OfflineBanner testID="shell-offline-banner" />
        <AppTabs />
      </View>
    </OnboardingGuard>
  );
}

const styles = StyleSheet.create({
  base: { flex: 1, backgroundColor: theme.colors.canvas },
});
