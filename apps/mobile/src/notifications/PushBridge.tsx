// Câblage du toucher et de la bannière de premier plan (SPEC-3501 EF-2 ; BR-NOT-02).
//
// One component for the whole process, mounted by the root layout inside the session provider:
// it installs the notification handler (the foreground banner replaces the system one), subscribes
// to the taps of the three application states — closed (`getLastNotificationResponseAsync`),
// background and foreground (`addNotificationResponseReceivedListener`) — and registers the device
// token at start-up once the session is confirmed. A tap received while the shell is closed is kept
// by `PushRouter` and opened when the guard confirms the session, never before.
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { useSession } from '../auth/session';
import { theme } from '../theme';
import { Text } from '../ui/Text';

import {
  installNotificationHandler,
  prepareNotificationChannel,
} from './expo-device';
import { PushRouter, pushBanner, pushContentOf, pushDataOf, type PushContent } from './handlers';
import { devicePushRegistrar } from './use-device-channel';

const t = fr.mobile.profile.notifications;

/** The internal banner of the foreground: same title, same destination as the system one. */
export function PushBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [content, setContent] = useState<PushContent | null>(pushBanner.get());

  useEffect(() => pushBanner.subscribe(setContent), []);

  if (content === null) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + theme.spacing.sm }]}>
      <Pressable
        testID="push-banner"
        accessibilityRole="button"
        accessibilityLabel={`${content.title}. ${content.body}`}
        onPress={() => {
          pushBanner.hide();
          router.push(content.href);
        }}
        style={styles.content}
      >
        <Text variant="rowTitle" tone="primary" testID="push-banner-title">
          {content.title}
        </Text>
        <Text variant="rowSubtitle" tone="muted" numberOfLines={2}>
          {content.body}
        </Text>
      </Pressable>
      <Pressable
        testID="push-banner-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t.bannerDismiss}
        onPress={() => {
          pushBanner.hide();
        }}
        style={styles.dismiss}
      >
        <Text variant="rowSubtitle" tone="secondary">
          {t.bannerDismiss}
        </Text>
      </Pressable>
    </View>
  );
}

/** Wiring of the push channels of the process; renders the internal banner. */
export function PushBridge() {
  const router = useRouter();
  const session = useSession();
  const signedIn = session.status === 'signedIn';
  const signedInRef = useRef(false);
  const pushRouter = useMemo(
    () =>
      new PushRouter((href) => {
        router.push(href);
      }),
    [router],
  );

  pushRouter.setSession(signedIn);

  useEffect(() => {
    installNotificationHandler();
    void prepareNotificationChannel().catch(() => undefined);
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      pushRouter.receive(pushDataOf(response.notification.request));
    });
    const last = Notifications.getLastNotificationResponse();
    if (last !== null) pushRouter.receive(pushDataOf(last.notification.request));
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const content = pushContentOf(pushDataOf(notification.request));
      if (content !== null) pushBanner.show(content);
    });
    return () => {
      subscription.remove();
      received.remove();
    };
  }, [pushRouter]);

  useEffect(() => {
    if (signedIn) {
      pushRouter.authenticated();
      void devicePushRegistrar.sync().catch(() => undefined);
    } else if (signedInRef.current && session.status === 'signedOut') {
      void devicePushRegistrar.signOut().catch(() => undefined);
    }
    signedInRef.current = signedIn;
  }, [pushRouter, session.status, signedIn]);

  return <PushBanner />;
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderStrong,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  content: { gap: 2, paddingVertical: theme.spacing.xs },
  dismiss: { alignSelf: 'flex-end', paddingVertical: theme.spacing.xs },
});

export default PushBridge;
