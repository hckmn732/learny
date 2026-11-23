// Source sheet of a citation (SPEC-3302 EF-2, BR-COU-02, CL-4).
//
// A citation carries an identifier, never a model-written URL: the sheet asks the server for the
// owner's source (`GET /course-citations/:cid/source`), shows where it opens - page, minute, anchor -
// and hands it to the in-app browser. A deleted source keeps its label and says « Source
// indisponible » (ADR-0039, CL-4).
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CourseCitation, CourseCitationSource } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { useCitationSource } from '../../data/course';
import { openExternal } from '../../lib/web';
import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import { citationLabel, sourceLocationLabel } from './view-model';

const m = fr.mobile.cours;

export interface CitationSheetProps {
  readonly citation: CourseCitation | null;
  readonly onClose: () => void;
}

/** Fiche of one citation: extract, page or minute, and « Ouvrir la ressource ». */
export function CitationSheet({ citation, onClose }: CitationSheetProps) {
  const { load, reset, pending, failed } = useCitationSource();
  const citationId = citation?.id ?? null;
  const [resolved, setResolved] = useState<{
    readonly id: string;
    readonly source: CourseCitationSource;
  } | null>(null);

  useEffect(() => {
    if (citationId === null) {
      reset();
      return;
    }
    let cancelled = false;
    void load(citationId)
      .then((source) => {
        if (!cancelled) setResolved({ id: citationId, source });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [citationId, load, reset]);

  if (citation === null) return null;
  const source = resolved?.id === citationId ? resolved.source : null;
  const unavailable = source !== null && (source.deleted || source.url === null);
  const location = source === null ? '' : sourceLocationLabel(source);

  return (
    <Sheet onClose={onClose} visible testID="course-source" title={m.source.title}>
      <Text testID="course-source-label" tone="primary" variant="title">
        {citationLabel(citation)}
      </Text>
      {citation.quote === null || citation.quote === '' ? null : (
        <Text tone="secondary" variant="bodySmall">
          {citation.quote}
        </Text>
      )}
      {pending ? (
        <Text testID="course-source-loading" tone="muted" variant="caption">
          {m.source.loading}
        </Text>
      ) : null}
      {failed ? (
        <Text testID="course-source-error" tone="danger" variant="caption">
          {m.source.error}
        </Text>
      ) : null}
      {unavailable ? (
        <View testID="course-source-unavailable" style={styles.unavailable}>
          <Text tone="danger" variant="title">
            {m.source.unavailable}
          </Text>
          <Text tone="secondary" variant="bodySmall">
            {m.source.unavailableBody}
          </Text>
        </View>
      ) : null}
      {source === null || unavailable ? null : (
        <View style={styles.actions}>
          {location === '' ? null : (
            <Text testID="course-source-location" tone="muted" variant="caption">
              {location}
            </Text>
          )}
          <Button
            disabled={source.url === null}
            label={m.source.open}
            onPress={() => {
              const url = source.url;
              if (url === null) return;
              onClose();
              void openExternal(url).catch(() => undefined);
            }}
            testID="course-source-open"
            variant="ink"
          />
        </View>
      )}
      <Button
        label={m.source.close}
        onPress={onClose}
        testID="course-source-close"
        variant="text"
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  unavailable: { gap: theme.spacing.xs },
  actions: { gap: theme.spacing.sm },
});
