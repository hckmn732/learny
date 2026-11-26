// Every failed action says why (QA 2026-11-26): the API client reports the failed mutations, this
// host shows the latest one at the top of the screen, above the tab bar and the keyboard.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiErrorText, onApiError } from '@learny/api-client';

import { theme } from '../../theme';
import { Toast } from '../../ui/Toast';

/** An error toast stays a little longer than a confirmation: the cause has to be read. */
const ERROR_TOAST_MS = 7000;

export function ApiErrorToast() {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<{ text: string; key: number } | null>(null);

  useEffect(
    () =>
      onApiError((report) => {
        const text = apiErrorText(report);
        // The same sentence already on screen is not shown again; a new one replaces it.
        setMessage((current) =>
          current?.text === text ? current : { text, key: (current?.key ?? 0) + 1 },
        );
      }),
    [],
  );

  if (message === null) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + theme.spacing.sm }]}>
      <Toast
        key={message.key}
        visible
        message={message.text}
        duration={ERROR_TOAST_MS}
        onHide={() => {
          setMessage(null);
        }}
        testID="api-error-toast"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, zIndex: 1000, elevation: 1000 },
});
