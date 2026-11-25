// Content sheet (SPEC-3002 EF-2): the non-routed bottom sheet of the fiches, radius 24 on iOS and
// 28 on Android with a grabber (canevas § 3). Dismissed by the backdrop, the grabber or the
// system back gesture; announced as a modal.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { controls, radius, theme } from '../theme';

import { Icon } from './Icon';
import { useEnterStyle } from './motion';
import { Text } from './Text';

export interface SheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
  readonly testID?: string;
}

/** Bottom sheet that holds content without a route of its own. */
export function Sheet({ visible, onClose, title, children, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const animated = useEnterStyle(theme.durations.sheet, 24);
  const t = fr.mobile.ui;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      {...(testID === undefined ? {} : { supportedOrientations: ['portrait'] as const })}
    >
      {/* A modal window is never resized by the soft keyboard on Android: the sheet rises above it
          itself, so a field of the sheet stays visible while it is typed in (both platforms). */}
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable
          testID={testID === undefined ? undefined : `${testID}-backdrop`}
          accessibilityRole="button"
          accessibilityLabel={t.close}
          onPress={onClose}
          style={styles.backdrop}
        />
        <Animated.View
          {...(testID === undefined ? {} : { testID })}
          accessibilityViewIsModal
          style={[styles.panel, animated, { paddingBottom: insets.bottom + theme.spacing.md }]}
        >
          <View style={styles.grabber} />
          {title === undefined ? null : (
            <View style={styles.header}>
              <Text variant="sheetTitle">{title}</Text>
              <Pressable
                testID={testID === undefined ? undefined : `${testID}-close`}
                accessibilityRole="button"
                accessibilityLabel={t.close}
                onPress={onClose}
                hitSlop={theme.spacing.md}
              >
                <Icon name="x" size={20} color={theme.colors.inkMuted} />
              </Pressable>
            </View>
          )}
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colors.overlay,
  },
  panel: {
    maxHeight: '92%',
    minHeight: '40%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    ...theme.elevation.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: controls.sheetGrabber.width,
    height: controls.sheetGrabber.height,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: theme.colors.handle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  body: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
});
