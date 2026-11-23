// Section menu of the course (SPEC-3302 EF-5; ADR-3010 § 1).
//
// A long press on a section, or its « ⋯ » button, opens this sheet: « Demander au tuteur sur ce
// passage », « Signaler une erreur » and « Corriger sur le web ». Offline, the two writes are
// disabled and the sheet says why (CL-1): the passage itself stays available, the tutor sheet of
// SPEC-3303 being a read-only conversation.
import { StyleSheet, View } from 'react-native';

import type { CourseSection } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';

import { hasSectionAction, sectionActions, sectionLabel } from './view-model';

const m = fr.mobile.cours;
const t = fr.course;

export interface SectionMenuSheetProps {
  readonly section: CourseSection | null;
  readonly online: boolean;
  readonly onClose: () => void;
  readonly onAskTutor: (section: CourseSection) => void;
  readonly onReport: (section: CourseSection) => void;
  readonly onEditOnWeb: (section: CourseSection) => void;
}

/** Actions of one section (EF-5). */
export function SectionMenuSheet({
  section,
  online,
  onClose,
  onAskTutor,
  onReport,
  onEditOnWeb,
}: SectionMenuSheetProps) {
  if (section === null) return null;
  const actions = sectionActions(section, online);
  return (
    <Sheet onClose={onClose} visible testID="course-section-menu" title={sectionLabel(section)}>
      <Text tone="muted" variant="caption">
        {m.section.menuTitle}
      </Text>
      {hasSectionAction(actions) ? null : (
        <Text testID="course-section-menu-empty" tone="secondary" variant="bodySmall">
          {m.section.noAction}
        </Text>
      )}
      <Button
        disabled={!actions.askTutor}
        icon="sparkles"
        label={m.section.askTutor}
        onPress={() => {
          onAskTutor(section);
        }}
        testID="course-menu-ask"
        variant="ink"
      />
      <Button
        disabled={!actions.report}
        icon="alert"
        label={m.section.report}
        onPress={() => {
          onReport(section);
        }}
        testID="course-menu-report"
        variant="outline"
      />
      <Button
        disabled={!actions.editOnWeb}
        icon="mail"
        label={m.section.editOnWeb}
        onPress={() => {
          onEditOnWeb(section);
        }}
        testID="course-menu-edit"
        variant="text"
      />
      {online ? null : (
        <Text testID="course-menu-offline" tone="secondary" variant="caption">
          {m.offline.write}
        </Text>
      )}
      <View style={styles.footer}>
        <Button
          label={m.section.menuClose}
          onPress={onClose}
          testID="course-menu-close"
          variant="text"
        />
      </View>
      {section.reported ? (
        <Text testID="course-menu-reported" tone="secondary" variant="caption">
          {t.reportedNotice}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: theme.spacing.sm },
});
