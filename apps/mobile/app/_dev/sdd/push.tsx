// `/_dev/sdd/push` — page de démonstration du toucher (SPEC-3501 EF-2, CA-3).
//
// A test build only (`EXPO_PUBLIC_ENABLE_SDD_PAGES=1`): it schedules a **local** notification whose
// payload is the one a push carries (title, text, internal destination, tag, icon), so the campaign
// can tap it and prove that the application opens the destination after the authentication guard.
// Nothing is sent anywhere: the page never talks to a push service (ADR-3018, ADR-3007).
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { configResult } from '../../../src/config';
import { ANDROID_CHANNEL_ID, prepareNotificationChannel } from '../../../src/notifications/expo-device';
import { theme } from '../../../src/theme';
import { Text } from '../../../src/ui/Text';

// Destination interne de la notification de démonstration : portée par le build e2e (comme le
// compte du fournisseur simulé, ADR-3402 ET-3), jamais une valeur de production.
const DEFAULT_HREF =
  (process.env.EXPO_PUBLIC_SDD_PUSH_HREF as string | undefined) ?? '/aujourdhui';
const DEFAULT_TITLE = 'Quiz de validation';
const DEFAULT_BODY = 'Il vous reste 40 minutes avant la fermeture du quiz.';

export default function PushDemoRoute() {
  const params = useLocalSearchParams<{ href?: string; title?: string; body?: string }>();
  const [status, setStatus] = useState('en attente');

  useEffect(() => {
    let cancelled = false;
    const schedule = async (): Promise<void> => {
      if (!(configResult.ok && configResult.config.enableSddPages)) {
        if (!cancelled) setStatus('démonstration désactivée');
        return;
      }
      await prepareNotificationChannel();
      // Ten seconds: the campaign has time to put the application in the background before the
      // local notification fires, so it reaches the system shade (EF-2, CA-3).
      const seconds = 10;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: params.title ?? DEFAULT_TITLE,
          body: params.body ?? DEFAULT_BODY,
          sound: 'default',
          data: {
            url: params.href ?? DEFAULT_HREF,
            tag: 'SPEC-3501',
            icon: 'clock',
          },
        },
        trigger:
          Platform.OS === 'android'
            ? {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds,
                channelId: ANDROID_CHANNEL_ID,
              }
            : { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      });
      if (!cancelled) setStatus('notification programmée');
    };
    void schedule().catch(() => {
      if (!cancelled) setStatus('notification impossible');
    });
    return () => {
      cancelled = true;
    };
  }, [params.body, params.href, params.title]);

  return (
    <View style={styles.root} testID="sdd-push">
      <Text variant="rowTitle" tone="primary" testID="sdd-push-status">
        {status}
      </Text>
      <Text variant="rowSubtitle" tone="muted" testID="sdd-push-href">
        {params.href ?? DEFAULT_HREF}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The internal banner of the foreground covers the top of the screen: the state of the
  // demonstration is written at the bottom, where the campaign can always read it.
  root: {
    flex: 1,
    backgroundColor: theme.colors.canvas,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
});
