// Onglet Profil — racine (SPEC-3401 EF-1, EF-2, EF-6, CA-1 ; BR-ACC-10 à BR-ACC-12, BR-SET-05,
// BR-SET-06, BR-AUT-10 ; maquette `design/app-mobile/exports/screens/{ios,android}-08-profil.png`).
//
// The identity card, the three figures of the learner, the four groups of rows of EF-2, the banners
// of a pause and of a scheduled deletion, the sign-out and the version of the build. Every value
// comes from the server (`/me/profile`, `/streak`, `/home`, the gaps of the current formation,
// `/me/ai/models`, `/billing/subscription`, `/me/pause`) ; this screen formats and never decides.
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { useSession } from '../../auth/session';
import { useGaps, useHome, useStreak } from '../../data/home';
import { isPauseActive, usePause, usePauseActions } from '../../data/pause';
import { useDeletion, useProfile } from '../../data/profile';
import { useSubscription } from '../../data/subscription';
import { chosenModelLabel, useTaskModels } from '../../data/task-models';
import { civilDayLong, formatIsoDay, formatUserDate } from '../../lib/dates';
import { openOnWeb } from '../../lib/web';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { Avatar } from '../../ui/Avatar';
import { Banner } from '../../ui/Banner';
import { Chip } from '../../ui/Chip';
import { ErrorState } from '../../ui/ErrorState';
import { IconButton } from '../../ui/IconButton';
import { LargeTitleHeader } from '../../ui/LargeTitleHeader';
import { ListGroupHeader } from '../../ui/ListGroupHeader';
import { ListRow } from '../../ui/ListRow';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { StatCard } from '../../ui/StatCard';
import { Text } from '../../ui/Text';
import { Toast } from '../../ui/Toast';
import { displayNameOf, initialsOf, useUnreadCount } from '../shell/use-shell';

import { PauseSheet } from './PauseSheet';
import { rhythmSummary } from './rhythm-summary';

const t = fr.mobile.profile;
const ht = fr.shell.header;
const settings = fr.settings;

/** « 12 j de série », « 86 % retenu à 1 mois », « 4 lacunes » (EF-1). */
function figure(value: number | null, unit: 'j' | '%'): { value: string; unit?: string } {
  if (value === null) return { value: '—' };
  return { value: String(value), unit };
}

/** Month of the creation of the account, for the chip « Membre depuis septembre » (EF-1). */
export function memberMonth(createdAt: string, timeZone: string): string {
  const label = civilDayLong(formatIsoDay(createdAt, timeZone));
  const parts = label.split(' ');
  return parts.length >= 2 ? (parts[parts.length - 1] ?? label) : label;
}

/** Root screen of the Profil tab. */
export function ProfileScreen() {
  const router = useRouter();
  const online = useOnlineStatus();
  const session = useSession();
  const profile = useProfile();
  const streak = useStreak();
  const home = useHome();
  const unread = useUnreadCount();
  const pause = usePause();
  const pauseActions = usePauseActions();
  const deletion = useDeletion();
  const models = useTaskModels();
  const subscription = useSubscription();

  const me = profile.data?.me ?? null;
  const timeZone = me?.timezone ?? 'Europe/Paris';
  /** `initialsOf` and `displayNameOf` read the header shape: the settings read names the address. */
  const identity = {
    firstName: me?.firstName ?? null,
    lastName: me?.lastName ?? null,
    emailLabel: me?.email ?? null,
  };
  const gaps = useGaps(me?.currentFormationId ?? null);

  const [sheet, setSheet] = useState<'settings' | 'pause' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (message: string): void => {
    setToast(message);
  };

  const refresh = (): void => {
    profile.refetch();
    streak.refetch();
    home.refetch();
    pause.refetch();
    models.refetch();
    subscription.refetch();
  };

  const signOut = (): void => {
    Alert.alert(t.rows.signOut, undefined, [
      { text: t.pause.cancel, style: 'cancel' },
      {
        text: t.rows.signOut,
        style: 'destructive',
        onPress: () => {
          void session.signOut();
        },
      },
    ]);
  };

  const openWeb = (path: string): void => {
    void openOnWeb(path).catch(() => {
      notify(t.saveError);
    });
  };

  const rhythm = profile.data?.rhythm ?? null;
  const streakFigure = figure(streak.data?.days ?? null, 'j');
  const retentionFigure = figure(home.data?.retention.oneMonth ?? null, '%');
  const gapsFigure = figure(gaps.data?.summary.openGaps ?? null, 'j');

  const resume = (): void => {
    void pauseActions
      .end()
      .then(() => {
        notify(t.pauseResumed);
      })
      .catch(() => {
        notify(t.pauseError);
      });
  };

  const cancelDeletion = (): void => {
    void deletion
      .cancel()
      .then(() => {
        notify(t.deletionCancelled);
      })
      .catch(() => {
        notify(t.deletionError);
      });
  };

  return (
    <View style={styles.screen} testID="profil-screen">
      <LargeTitleHeader
        eyebrow={t.eyebrow}
        title={t.title}
        testID="profil-header"
        actions={
          <IconButton
            name="settings"
            accessibilityLabel={t.settingsAction}
            onPress={() => {
              setSheet('settings');
            }}
            testID="profile-settings"
          />
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={profile.status === 'loading'} onRefresh={refresh} />
        }
      >
        {online ? null : <Banner tone="offline" description={t.offline} testID="profile-offline" />}

        {profile.status === 'error' ? (
          <ErrorState testID="profile-error" title={t.errorTitle} onRetry={profile.refetch} />
        ) : null}

        {profile.status === 'loading' ? (
          <View style={styles.skeleton} testID="profile-skeleton">
            <Skeleton animated={false} height={96} />
            <Skeleton animated={false} />
          </View>
        ) : null}

        {me === null ? null : (
          <>
            <View style={styles.identity} testID="profile-identity">
              <Avatar initials={initialsOf(identity)} size="lg" />
              <View style={styles.identityTexts}>
                <Text variant="sectionTitle" numberOfLines={1} testID="profile-name">
                  {displayNameOf(identity)}
                </Text>
                <Text variant="rowSubtitle" tone="muted" numberOfLines={1} testID="profile-role">
                  {t.learner(ht.activeFormations(profile.data?.activeFormationCount ?? 0))}
                </Text>
                <Chip
                  label={t.memberSince(memberMonth(profile.data?.createdAt ?? '', timeZone))}
                  tone="neutral"
                  testID="profile-member-since"
                />
              </View>
            </View>

            <View style={styles.stats} testID="profile-stats">
              <StatCard
                testID="profile-stat-1"
                tone="lime"
                icon="flame"
                label={t.stats.streak}
                value={streakFigure.value}
                {...(streakFigure.unit === undefined ? {} : { unit: streakFigure.unit })}
              />
              <StatCard
                testID="profile-stat-2"
                icon="target"
                label={t.stats.retention}
                value={retentionFigure.value}
                {...(retentionFigure.unit === undefined ? {} : { unit: retentionFigure.unit })}
              />
              <StatCard
                testID="profile-stat-3"
                icon="alert"
                label={t.stats.gaps}
                value={gapsFigure.value}
              />
            </View>

            {isPauseActive(pause.data) ? (
              <Banner
                testID="profile-pause-banner"
                tone="info"
                icon="pause"
                title={t.pauseBanner(civilDayLong(pause.data?.endsOn ?? ''))}
                action={{ label: t.pauseResume, onPress: resume }}
              />
            ) : null}

            {profile.data?.deletionScheduledFor == null ? null : (
              <Banner
                testID="profile-deletion-banner"
                tone="offline"
                icon="alert"
                title={t.deletionBanner(
                  formatUserDate(profile.data.deletionScheduledFor, profile.data.me),
                )}
                action={{ label: t.deletionCancel, onPress: cancelDeletion }}
              />
            )}

            <View>
              <ListGroupHeader title={t.groups.account} />
              <View style={styles.list}>
                <ListRow
                  testID="profile-row-identity"
                  icon="user"
                  title={t.rows.identity}
                  subtitle={`${displayNameOf(identity)} · ${me.email}`}
                  separator={false}
                  onPress={() => {
                    router.push('/profil/identite');
                  }}
                />
                <ListRow
                  testID="profile-row-notifications"
                  icon="bell"
                  title={t.rows.notifications}
                  subtitle={t.rows.notificationsHint(unread.count)}
                  onPress={() => {
                    router.push('/profil/notifications');
                  }}
                />
                <ListRow
                  testID="profile-row-security"
                  icon="lock"
                  title={t.rows.security}
                  subtitle={t.rows.securityHint}
                  onPress={() => {
                    router.push('/profil/securite');
                  }}
                />
              </View>

              <ListGroupHeader title={t.groups.learning} />
              <View style={styles.list}>
                <ListRow
                  testID="profile-row-rhythm"
                  icon="clock"
                  title={t.rows.rhythm}
                  subtitle={rhythm === null ? '' : rhythmSummary(rhythm)}
                  separator={false}
                  onPress={() => {
                    router.push('/profil/rythme');
                  }}
                />
                <ListRow
                  testID="profile-row-models"
                  icon="sparkles"
                  title={t.rows.models}
                  subtitle={chosenModelLabel(models.data) ?? t.models.noChoice}
                  onPress={() => {
                    router.push('/profil/modeles');
                  }}
                />
              </View>

              <ListGroupHeader title={t.groups.subscription} />
              <View style={styles.list}>
                <ListRow
                  testID="profile-row-subscription"
                  icon="card"
                  title={t.rows.subscription}
                  subtitle={
                    subscription.data === null
                      ? ''
                      : settings.subscriptionTab.statuses[subscription.data.status]
                  }
                  separator={false}
                  onPress={() => {
                    router.push('/profil/abonnement');
                  }}
                />
              </View>

              <ListGroupHeader title={t.groups.help} />
              <View style={styles.list}>
                <ListRow
                  testID="profile-row-help"
                  icon="help"
                  title={t.rows.help}
                  separator={false}
                  onPress={() => {
                    openWeb('/parametres');
                  }}
                />
                <ListRow
                  testID="profile-row-terms"
                  icon="book"
                  title={t.rows.terms}
                  onPress={() => {
                    openWeb('/legal/cgu');
                  }}
                />
                <ListRow
                  testID="profile-row-privacy"
                  icon="shield"
                  title={t.rows.privacy}
                  onPress={() => {
                    openWeb('/legal/confidentialite');
                  }}
                />
                <ListRow
                  testID="profile-row-data"
                  icon="lock"
                  title={t.rows.data}
                  subtitle={t.rows.dataHint}
                  onPress={() => {
                    router.push('/profil/confidentialite');
                  }}
                />
                <ListRow
                  testID="profile-sign-out"
                  icon="logout"
                  title={t.rows.signOut}
                  onPress={signOut}
                />
              </View>
            </View>

            <Text variant="caption" tone="muted" align="center" testID="profile-version">
              {t.version(
                typeof Constants.expoConfig?.version === 'string'
                  ? Constants.expoConfig.version
                  : '1.0',
                String(Constants.expoConfig?.android?.versionCode ?? 1),
              )}
            </Text>
          </>
        )}
      </ScrollView>

      <Sheet
        visible={sheet === 'settings'}
        onClose={() => {
          setSheet(null);
        }}
        title={t.settingsTitle}
        testID="profile-settings-sheet"
      >
        <Text variant="rowSubtitle" tone="muted">
          {t.settingsBody}
        </Text>
        <View style={styles.list}>
          <ListRow
            testID="settings-row-identity"
            icon="user"
            title={t.rows.identity}
            separator={false}
            onPress={() => {
              setSheet(null);
              router.push('/profil/identite');
            }}
          />
          <ListRow
            testID="settings-row-notifications"
            icon="bell"
            title={t.rows.notifications}
            onPress={() => {
              setSheet(null);
              router.push('/profil/notifications');
            }}
          />
          <ListRow
            testID="settings-row-rhythm"
            icon="clock"
            title={t.rows.rhythm}
            onPress={() => {
              setSheet(null);
              router.push('/profil/rythme');
            }}
          />
          <ListRow
            testID="settings-row-pause"
            icon="pause"
            title={t.pause.title}
            onPress={() => {
              setSheet('pause');
            }}
          />
        </View>
      </Sheet>

      <PauseSheet
        visible={sheet === 'pause'}
        onClose={() => {
          setSheet(null);
        }}
        onDone={notify}
        timeZone={timeZone}
      />

      <Toast
        testID="profil-toast"
        visible={toast !== null}
        message={toast ?? ''}
        onHide={() => {
          setToast(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.canvas },
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  skeleton: { gap: theme.spacing.md },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...theme.elevation.card,
  },
  identityTexts: { flex: 1, minWidth: 0, gap: theme.spacing.xs, alignItems: 'flex-start' },
  stats: { flexDirection: 'row', gap: theme.spacing.sm },
  list: { borderRadius: theme.radius.list, overflow: 'hidden' },
});
