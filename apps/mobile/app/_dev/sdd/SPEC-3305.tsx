// Demonstration page `/_dev/sdd/SPEC-3305` (SPEC-3305 EF-8, CL-2; ADR-3018).
//
// Maestro 2.12.1 cannot toggle the radio of the emulator; this page flips the network state of
// TanStack Query (the same `onlineManager` NetInfo feeds) so that the campaign can show the offline
// band, play the prefetched session and return to the online state. It also exposes the size of the
// queue and the state of the offline pack, which the flow asserts.
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { secureSessionStorage } from '../../../src/auth/secure-backend';
import { isOnline, setOnlineForDemo } from '../../../src/offline/network';
import { readPack } from '../../../src/offline/pack';
import { readQueue } from '../../../src/offline/queue';
import { theme } from '../../../src/theme';
import { Button, Text } from '../../../src/ui';

export default function Spec3305Route() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(() => isOnline());
  const [packDay, setPackDay] = useState<string>('aucun');
  const [queued, setQueued] = useState<number>(0);

  const refresh = useCallback(() => {
    void (async () => {
      const pack = await readPack(secureSessionStorage);
      const queue = await readQueue(secureSessionStorage);
      setPackDay(pack === null ? 'aucun' : pack.day);
      setQueued(queue.items.length);
    })();
  }, []);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
      testID="sdd-3305"
    >
      <Text variant="largeTitle">SPEC-3305</Text>
      <Text variant="caption" tone="muted">
        Réviser · démonstration hors ligne
      </Text>
      <View style={styles.card}>
        <Text variant="body" testID="sdd-3305-network">
          {online ? 'Réseau disponible' : 'Mode hors ligne'}
        </Text>
        <Button
          label={online ? 'Passer hors ligne' : 'Revenir en ligne'}
          onPress={() => {
            const next = !online;
            setOnlineForDemo(next);
            setOnline(next);
            refresh();
          }}
          testID="sdd-offline-toggle"
        />
        <Button
          label="Rafraîchir l’état"
          variant="outline"
          onPress={refresh}
          testID="sdd-3305-refresh"
        />
        <Text variant="caption" testID="sdd-3305-pack">
          {`Paquet : ${packDay}`}
        </Text>
        <Text variant="caption" testID="sdd-3305-queue">
          {`File : ${String(queued)}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          refresh();
        }}
        testID="sdd-3305-home"
      >
        <Text variant="body" tone="primary">
          learny://reviser
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  card: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
  },
});
