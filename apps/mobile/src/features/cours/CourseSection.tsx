// One section of the course article (SPEC-3302 EF-2, EF-5; BR-COU-02, BR-COU-04 to BR-COU-06,
// BR-COU-09).
//
// The section kind selects the rendering of the mockup: prose through the Markdown renderer of
// SPEC-3301, the indigo « Question éclair » with its hidden answer (BR-COU-05), the orange « Ne pas
// confondre » (BR-COU-06), the ink « À retenir » card (BR-COU-04) and the dashed tutor complement.
// A reported section says so (BR-COU-09). The long press opens the section menu (EF-5); the
// « ⋯ » button opens the same menu for a screen reader, so the gesture is never the only way
// (ADR-3010 § 1).
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CourseCitation, CourseSection as CourseSectionDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { radius, theme } from '../../theme';
import { Icon } from '../../ui/Icon';
import { IconButton } from '../../ui/IconButton';
import { Markdown } from '../../ui/Markdown';
import { Text } from '../../ui/Text';

import { citationLabel, sectionLabel } from './view-model';

const m = fr.mobile.cours;
const t = fr.course;

export interface CourseSectionProps {
  readonly section: CourseSectionDto;
  readonly onLongPress: (section: CourseSectionDto) => void;
  readonly onActions: (section: CourseSectionDto) => void;
  readonly onCitation: (section: CourseSectionDto, citation: CourseCitation) => void;
  /** Vertical offset of the section inside the list, measured for the reading progress (ET-2). */
  readonly onMeasured: (sectionId: string, y: number, height: number) => void;
}

/** BR-COU-05 - « Question éclair »: the answer stays hidden until « Afficher la réponse ». */
function QuickQuestion({ section }: { readonly section: CourseSectionDto }) {
  const [revealed, setRevealed] = useState(false);
  const data = section.data ?? {};
  const question = typeof data.question === 'string' ? data.question : '';
  const answer = typeof data.answer === 'string' ? data.answer : '';
  return (
    <View style={styles.quick} testID="course-quick-question">
      <Text tone="indigoInk" variant="label">
        {t.quickQuestion}
      </Text>
      <Text variant="sectionTitle">{question}</Text>
      {revealed ? (
        <Text testID="course-answer" tone="primary" variant="bodySmall">
          {answer}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: revealed }}
        onPress={() => {
          setRevealed(!revealed);
        }}
        style={styles.reveal}
        testID="course-reveal"
      >
        <Text tone="indigoInk" variant="buttonSmall">
          {revealed ? t.hide : t.reveal}
        </Text>
      </Pressable>
    </View>
  );
}

/** BR-COU-06 - the two sides of the orange warning block. */
function Comparison({ section }: { readonly section: CourseSectionDto }) {
  const data = section.data ?? {};
  const sides = (['left', 'right'] as const).map((key) => {
    const value = data[key];
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  });
  return (
    <View style={styles.confusion} testID="course-confusion">
      <View style={styles.confusionHeader}>
        <Icon color={theme.colors.orangeInk} name="alert" size={16} />
        <Text tone="danger" variant="label">
          {t.comparison}
        </Text>
      </View>
      {sides.map((side, index) => (
        <View key={`side-${String(index)}`} style={styles.confusionSide}>
          <Text variant="title">{typeof side.title === 'string' ? side.title : ''}</Text>
          <Text tone="secondary" variant="bodySmall">
            {typeof side.body === 'string' ? side.body : ''}
          </Text>
          {typeof side.example === 'string' && side.example !== '' ? (
            <Text tone="danger" variant="buttonSmall">
              {side.example}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** BR-COU-04 - « À retenir »: three to seven points, optionally a mnemonic. */
function Takeaway({ section }: { readonly section: CourseSectionDto }) {
  const data = section.data ?? {};
  const points = Array.isArray(data.points)
    ? data.points.filter((point): point is string => typeof point === 'string')
    : [];
  const mnemonic = typeof data.mnemonic === 'string' ? data.mnemonic : null;
  return (
    <View style={styles.takeaway} testID="course-takeaway">
      <Text tone="inverse" variant="sectionTitle">
        {t.takeaway}
      </Text>
      {points.map((point, index) => (
        <View key={`point-${String(index)}`} style={styles.point}>
          <View style={styles.pointMark}>
            <Icon color={theme.colors.ink} name="check" size={12} />
          </View>
          <Text style={styles.pointText} tone="onDarkSecondary" variant="bodySmall">
            {point}
          </Text>
        </View>
      ))}
      {mnemonic === null ? null : (
        <Text style={styles.mnemonic} tone="primary" variant="bodySmall">
          {t.mnemonic} : {mnemonic}
        </Text>
      )}
    </View>
  );
}

/** BR-COU-01 - a section the tutor completed: it is flagged, never passed off as verified. */
function TutorCompleted({ section }: { readonly section: CourseSectionDto }) {
  return (
    <View style={styles.tutorCompleted} testID="course-tutor-complement">
      <Text tone="muted" variant="label">
        {t.tutorCompleted}
      </Text>
      {section.contentMd === null ? null : (
        <Markdown markdown={section.contentMd} testID="course-markdown" />
      )}
    </View>
  );
}

function SectionBody({ section }: { readonly section: CourseSectionDto }) {
  switch (section.kind) {
    case 'flash_question':
      return <QuickQuestion section={section} />;
    case 'dont_confuse':
      return <Comparison section={section} />;
    case 'retain':
      return <Takeaway section={section} />;
    case 'summary_prompt':
      // The prompt is rendered by the summary form at the end of the chapter (BR-COU-07).
      return null;
    case 'tutor_completed':
      return <TutorCompleted section={section} />;
    default:
      return section.contentMd === null ? null : (
        <Markdown markdown={section.contentMd} testID="course-markdown" />
      );
  }
}

/** One section of the article, with its citations and its actions (EF-2, EF-5). */
export const CourseSection = memo(function CourseSection({
  section,
  onLongPress,
  onActions,
  onCitation,
  onMeasured,
}: CourseSectionProps) {
  const label = sectionLabel(section);
  return (
    <View
      onLayout={(event) => {
        const { y, height } = event.nativeEvent.layout;
        onMeasured(section.id, y, height);
      }}
      style={styles.root}
      testID={`course-section-${section.id}`}
    >
      {section.reported ? (
        <Text testID="course-section-reported" tone="danger" variant="caption">
          {m.section.reported}
        </Text>
      ) : null}
      <Pressable
        accessible={false}
        delayLongPress={400}
        onLongPress={() => {
          onLongPress(section);
        }}
        testID={`course-section-body-${section.id}`}
      >
        <SectionBody section={section} />
      </Pressable>
      {section.citations.length === 0 ? null : (
        <View style={styles.citations}>
          {section.citations.map((citation) => (
            <Pressable
              accessibilityHint={m.source.open}
              accessibilityRole="button"
              key={citation.id}
              onPress={() => {
                onCitation(section, citation);
              }}
              style={styles.citation}
              testID={`course-citation-${section.anchor}`}
            >
              <Text tone="danger" variant="label">
                {citationLabel(citation)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        <IconButton
          accessibilityLabel={m.section.actionsLabel(label)}
          name="more"
          onPress={() => {
            onActions(section);
          }}
          testID={`course-section-actions-${section.id}`}
          variant="plain"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing.md, paddingVertical: theme.spacing.md },
  quick: {
    backgroundColor: theme.colors.indigoSoft,
    borderRadius: radius.card,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  reveal: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  confusion: {
    backgroundColor: theme.colors.orangeSoft,
    borderRadius: radius.card,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  confusionHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  confusionSide: { gap: theme.spacing.xs },
  takeaway: {
    backgroundColor: theme.colors.ink,
    borderRadius: radius.card,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  pointMark: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: radius.control,
    backgroundColor: theme.colors.lime,
  },
  pointText: { flex: 1, minWidth: 0 },
  mnemonic: {
    backgroundColor: theme.colors.lime,
    borderRadius: radius.control,
    padding: theme.spacing.md,
  },
  tutorCompleted: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: radius.card,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  citations: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  citation: {
    backgroundColor: theme.colors.orangeSoft,
    borderRadius: radius.control,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
