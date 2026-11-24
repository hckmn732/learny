// Report sheet of a course section (SPEC-3302 EF-5, BR-COU-09; CL-1).
//
// « Signaler une erreur » asks for a reason and posts it: the section leaves the new quiz draws until
// it is corrected (BR-COU-09). Offline, the action is disabled upstream - the section menu greys it -
// so this sheet is never opened without a network.
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import type { CourseSection } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import { sectionLabel } from './view-model';

const m = fr.mobile.cours;
const t = fr.course;

export interface SectionReportSheetProps {
  readonly section: CourseSection | null;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason: string) => void;
}

/** Reason of a report and its submit (BR-COU-09). */
export function SectionReportSheet({
  section,
  pending,
  failed,
  onClose,
  onSubmit,
}: SectionReportSheetProps) {
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  if (section === null) return null;

  return (
    <Sheet onClose={onClose} visible testID="course-section-report" title={t.reportTitle}>
      <Text tone="muted" variant="caption">
        {sectionLabel(section)}
      </Text>
      <TextInput
        accessibilityLabel={t.reportReason}
        multiline
        onChangeText={(value) => {
          setReason(value);
          setNotice(null);
        }}
        placeholder={t.reportReason}
        placeholderTextColor={theme.colors.inkMuted}
        style={styles.input}
        testID="course-report-reason"
        value={reason}
      />
      {notice === null ? null : (
        <Text testID="course-report-notice" tone="danger" variant="caption">
          {notice}
        </Text>
      )}
      {failed ? (
        <Text testID="course-report-error" tone="danger" variant="caption">
          {t.reportedError}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t.reportCancel}
          onPress={onClose}
          testID="course-report-cancel"
          variant="text"
        />
        <Button
          disabled={pending}
          label={t.reportSubmit}
          loading={pending}
          onPress={() => {
            if (reason.trim() === '') {
              setNotice(m.section.noAction);
              return;
            }
            onSubmit(reason.trim());
          }}
          testID="course-report-submit"
          variant="ink"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    ...theme.type.body,
    color: theme.colors.ink,
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: radius.control,
    padding: theme.spacing.md,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.sm },
});
