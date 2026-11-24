// Écran Sécurité et connexion (SPEC-3401 EF-3, EF-4 ; BR-ACC-12, BR-ACC-09).
//
// The sign-in address, the method the learner used, and the way out of this device. No password
// change is offered: no rule of V1 plans one (EF-4, BR-ACC-12), the connection goes through the magic
// link of SPEC-3017. The sign-out always asks for a confirmation (BR-ACC-09).
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { fr } from '@learny/i18n';

import { useSession } from '../../auth/session';
import { useProfile } from '../../data/profile';
import { Button } from '../../ui/Button';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { SettingsScaffold, SettingsSection } from './SettingsScaffold';

const t = fr.mobile.profile.security;
const p = fr.mobile.profile;

/** Route body of `/profil/securite`. */
export function SecurityScreen() {
  const router = useRouter();
  const session = useSession();
  const profile = useProfile();

  const close = (): void => {
    router.back();
  };

  if (profile.status === 'error') {
    return (
      <SettingsScaffold title={t.title} testID="security-screen" onBack={close}>
        <ErrorState title={p.errorTitle} onRetry={profile.refetch} testID="security-error" />
      </SettingsScaffold>
    );
  }

  if (profile.data === null) {
    return (
      <SettingsScaffold title={t.title} testID="security-screen" onBack={close}>
        <Skeleton animated={false} />
        <Skeleton animated={false} width="60%" />
      </SettingsScaffold>
    );
  }

  const signOut = (): void => {
    Alert.alert(p.rows.signOut, undefined, [
      { text: p.pause.cancel, style: 'cancel' },
      {
        text: p.rows.signOut,
        style: 'destructive',
        onPress: () => {
          void session.signOut();
        },
      },
    ]);
  };

  return (
    <SettingsScaffold title={t.title} testID="security-screen" onBack={close}>
      <SettingsSection title={t.email} testID="security-email-section">
        <Text variant="title" testID="security-email">
          {profile.data.me.email}
        </Text>
      </SettingsSection>

      <SettingsSection title={t.method} testID="security-method-section">
        <Text variant="rowSubtitle" tone="secondary" testID="security-method">
          {t.methodValue}
        </Text>
        <Text variant="caption" tone="muted">
          {t.device}
        </Text>
      </SettingsSection>

      <Button
        label={t.signOut}
        variant="outline"
        icon="logout"
        onPress={signOut}
        testID="security-sign-out"
      />

      <Text variant="caption" tone="muted" testID="security-password-note">
        {t.passwordNote}
      </Text>
    </SettingsScaffold>
  );
}
