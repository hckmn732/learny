// Demonstration page `/_dev/sdd/SPEC-3003` (SPEC-3003 EF-9, § 10).
//
// It exercises the whole socle on the device: sign-in of the demonstration account with the
// password of the build environment (never displayed), `GET /me` with the Bearer token, the
// three-fragment SSE relay of the API, the state of the query cache and the offline band.
//
// testIDs asserted by the Maestro flow: `sdd-session-status`, `sdd-me-firstname`, `sdd-stream`,
// `sdd-cache-status`, `sdd-cache-restored`, `sdd-offline-toggle`.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { apiClient, apiUrl } from '../../../src/api/instance';
import { streamDemoFragments } from '../../../src/api/stream';
import { nativeFetch } from '../../../src/api/transport';
import { readDemoCredentials } from '../../../src/auth/demo-credentials';
import { useSession } from '../../../src/auth/session';
import { queryKeys } from '../../../src/data/keys';
import { isCacheRestored, subscribeCacheRestored } from '../../../src/data/persist';
import { isOnline, setOnlineForDemo } from '../../../src/offline/network';
import { theme } from '../../../src/theme';
import { Text } from '../../../src/ui/Text';

const RELAY_PATH = '/api/v1/dev/sdd/relay-stream';

export default function Spec3003Route() {
  const insets = useSafeAreaInsets();
  const t = fr.mobile.sdd.spec3003;
  const session = useSession();
  const queryClient = useQueryClient();
  const credentials = useMemo(() => readDemoCredentials(), []);
  const autoSignIn = useRef(false);

  const [fragments, setFragments] = useState<readonly string[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => isOnline());

  const restored = useSyncExternalStore(subscribeCacheRestored, isCacheRestored, isCacheRestored);

  // EF-9 — the demonstration account signs in by itself; the password comes from the build
  // environment (`EXPO_PUBLIC_SDD_DEMO_PASSWORD`) and is never rendered.
  useEffect(() => {
    if (credentials === null || session.status !== 'signedOut' || autoSignIn.current) return;
    autoSignIn.current = true;
    void session.signIn(credentials.email, credentials.password);
  }, [credentials, session]);

  const me = useQuery({
    queryKey: queryKeys.sdd.me(),
    queryFn: () => apiClient.api.meGet({}),
    enabled: session.status === 'signedIn',
  });

  // EF-8, CA-3 — the three fragments of `GET /dev/sdd/relay-stream` arrive one by one.
  const streamIdle = t.streamIdle;
  useEffect(() => {
    if (session.status !== 'signedIn' || apiUrl === '') return undefined;
    const controller = new AbortController();
    void (async () => {
      const received: string[] = [];
      try {
        for await (const fragment of streamDemoFragments(nativeFetch, `${apiUrl}${RELAY_PATH}`, {
          signal: controller.signal,
        })) {
          received.push(fragment);
          setFragments([...received]);
        }
      } catch {
        // CL-3 — a cut stream keeps the partial text: the interruption is shown, never hidden.
        setStreamError(streamIdle);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [session.status, streamIdle]);

  const statusLabel =
    session.status === 'signedIn'
      ? t.sessionSignedIn
      : session.status === 'loading'
        ? t.sessionLoading
        : session.busy
          ? t.sessionSigningIn
          : t.sessionSignedOut;

  const cacheCount = queryClient.getQueryCache().getAll().length;
  const cacheLabel = `${t.cacheLabel} : ${t.cacheEntries.replace('{count}', String(cacheCount))}${
    restored ? ` · ${t.cacheRestored}` : ''
  }`;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="eyebrow" tone="secondary">
          {t.eyebrow}
        </Text>
        <Text variant="title" testID="sdd-title">
          {t.title}
        </Text>

        <Text variant="rowSubtitle" tone="secondary">
          {t.sessionLabel}
        </Text>
        <Text variant="title" testID="sdd-session-status">
          {statusLabel}
        </Text>

        <Text variant="rowSubtitle" tone="secondary">
          {t.firstNameLabel}
        </Text>
        <Text variant="title" testID="sdd-me-firstname">
          {me.data?.firstName ?? t.cacheCold}
        </Text>

        <Text variant="rowSubtitle" tone="secondary">
          {t.streamLabel}
        </Text>
        <Text variant="body" testID="sdd-stream">
          {fragments.length === 0 ? (streamError ?? t.streamIdle) : fragments.join('')}
        </Text>

        <Text variant="rowSubtitle" tone="secondary">
          {t.cacheLabel}
        </Text>
        <Text variant="body" testID="sdd-cache-status">
          {cacheLabel}
        </Text>
        {restored ? (
          <Text variant="body" testID="sdd-cache-restored">
            {t.cacheRestored}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          testID="sdd-offline-toggle"
          onPress={() => {
            const next = !online;
            setOnlineForDemo(next);
            setOnline(next);
          }}
          style={styles.button}
        >
          <Text variant="chip" tone="indigoInk">
            {online ? t.offlineToggle : t.onlineToggle}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          testID="sdd-reload"
          onPress={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.sdd.me() });
          }}
          style={styles.button}
        >
          <Text variant="chip" tone="indigoInk">
            {t.reload}
          </Text>
        </Pressable>

        <Text variant="caption" tone="secondary">
          {t.footer}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  button: {
    minHeight: theme.minTouchTarget.height,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.indigoSoft,
  },
});
