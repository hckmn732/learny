// A figure of the learner's document inside a course (QA 2026-11-26).
//
// The course Markdown holds `![caption](/api/v1/resources/<id>/figures/<n>)`: the image is read
// from the API with the session token (the route serves the owner only), shown at its own aspect
// ratio, and its caption follows. An external `https` image is shown as is, without the token.
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { getSessionToken } from '../auth/session-token';
import { configResult } from '../config';
import { radius, theme } from '../theme';

import { Text } from './Text';

const DEFAULT_RATIO = 4 / 3;

/** The absolute address of a figure, or `null` for an address the application cannot load. */
export function figureUri(url: string, apiUrl: string): string | null {
  if (url.startsWith('/api/')) return apiUrl === '' ? null : `${apiUrl.replace(/\/+$/u, '')}${url}`;
  if (url.startsWith('https://')) return url;
  return null;
}

export function MarkdownFigure({ url, alt }: { readonly url: string; readonly alt: string }) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [failed, setFailed] = useState(false);
  const apiUrl = configResult.ok ? configResult.config.apiUrl : '';
  const uri = figureUri(url, apiUrl);
  const token = getSessionToken();
  const own = url.startsWith('/api/');

  return (
    <View style={styles.figure} testID="course-figure">
      {uri === null || failed ? null : (
        <Image
          accessibilityLabel={alt}
          accessibilityRole="image"
          resizeMode="contain"
          source={{
            uri,
            ...(own && token !== null ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          }}
          style={[styles.image, { aspectRatio: ratio }]}
          onError={() => {
            setFailed(true);
          }}
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source;
            if (width > 0 && height > 0) setRatio(width / height);
          }}
        />
      )}
      {alt === '' ? null : (
        <Text variant="caption" tone="muted">
          {alt}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  figure: { gap: theme.spacing.xs, marginVertical: theme.spacing.sm },
  image: {
    width: '100%',
    borderRadius: radius.control,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
});
