// Account sheet (SPEC-3102 EF-4, BR-NAV-01, CA-4; mockup `account` of `design/app-mobile`).
//
// Identity of the learner, the number of active formations in the sub-title of the sheet, the way
// to the Profil tab, the pause of SPEC-3401 (not delivered yet: the row says it) and the
// sign-out, which always asks for a confirmation before calling `signOut()` (BR-ACC-09).
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { useSession } from '../../auth/session';
import { theme } from '../../theme';
import { Chip } from '../../ui/Chip';
import { ListRow } from '../../ui/ListRow';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';

import { RouteSheet } from './RouteSheet';
import { displayNameOf, initialsOf, useHeader } from './use-shell';

export interface AccountSheetProps {
  readonly onClose: () => void;
  /** Called once the local session is closed (CA-4). */
  readonly onSignedOut?: () => void;
}

const t = fr.mobile.shell.account;
const ht = fr.shell.header;

/** « Mon compte » sheet of `app/compte.tsx`. */
export function AccountSheet({ onClose, onSignedOut }: AccountSheetProps) {
  const router = useRouter();
  const session = useSession();
  const header = useHeader();
  const [pauseNotice, setPauseNotice] = useState(false);
  const data = header.data;
  const formations = ht.activeFormations(data?.activeFormationCount ?? 0);

  const askSignOut = (): void => {
    Alert.alert(t.signOutTitle, undefined, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.signOutConfirm,
        style: 'destructive',
        onPress: () => {
          onClose();
          void session.signOut().then(() => {
            onSignedOut?.();
          });
        },
      },
    ]);
  };

  return (
    <RouteSheet
      testID="account-sheet"
      title={t.title}
      subtitle={t.subtitle(formations)}
      icon="user"
      onClose={onClose}
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text variant="sectionTitle" tone="inverse">
            {data === null ? '…' : initialsOf(data)}
          </Text>
        </View>
        <View style={styles.identityTexts}>
          <Text variant="sectionTitle" numberOfLines={1} testID="account-name">
            {data === null ? ht.accountFallback : displayNameOf(data)}
          </Text>
          <Text variant="rowSubtitle" tone="muted" numberOfLines={1} testID="account-email">
            {data?.emailLabel ?? ''}
          </Text>
        </View>
        <Chip label={t.active} tone="lime" />
      </View>

      <View style={styles.rows}>
        <ListRow
          testID="account-settings"
          icon="settings"
          title={ht.settings}
          subtitle={t.settingsHint}
          separator={false}
          onPress={() => {
            onClose();
            router.replace('/profil');
          }}
        />
        <ListRow
          testID="account-pause"
          icon="pause"
          title={ht.pause}
          subtitle={t.pauseHint}
          onPress={() => {
            setPauseNotice(true);
          }}
        />
        <ListRow testID="account-sign-out" icon="logout" title={ht.signOut} onPress={askSignOut} />
      </View>

      <Toast
        testID="account-pause-toast"
        visible={pauseNotice}
        message={t.pauseUnavailable}
        onHide={() => {
          setPauseNotice(false);
        }}
      />
    </RouteSheet>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  avatar: {
    width: theme.controls.avatar.lg,
    height: theme.controls.avatar.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigo,
  },
  identityTexts: { flex: 1, minWidth: 0, gap: 2 },
  rows: { borderRadius: theme.radius.list, overflow: 'hidden' },
});
