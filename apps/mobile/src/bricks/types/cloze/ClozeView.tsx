// `cloze` brick (SPEC-3301 EF-4, CL-3, BR-MEM-05): `{{n}}` tokens of the template become inline
// fields whose width follows the hint; the comparison is the server's (or `gradeBrick` offline),
// never done here.
import { StyleSheet, TextInput, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme, type as typeScale } from '../../../theme';
import { Text } from '../../../ui';
import { parsePublicPayload } from '../../public-schemas';
import type { NativeBrickViewProps } from '../../registry';
import { clozeResponse, clozeValues } from '../../responses';
import { BrickCard, Feedback, InvalidCharge, QuestionHeader, Sources } from '../../shared';
import { correctionIsCorrect } from '../../verdict';

const t = fr.mobile.bricks;
const GAP_TOKEN = /\{\{(\d+)\}\}/g;

interface Segment {
  readonly kind: 'text' | 'gap';
  readonly value: string;
  readonly gapId: number;
}

/** Splits the template on its `{{n}}` tokens, keeping the running text between them. */
export function templateSegments(template: string): readonly Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of template.matchAll(GAP_TOKEN)) {
    const index = match.index;
    if (index > last) {
      segments.push({ kind: 'text', value: template.slice(last, index), gapId: 0 });
    }
    segments.push({ kind: 'gap', value: match[1] ?? '', gapId: Number(match[1]) });
    last = index + match[0].length;
  }
  if (last < template.length) {
    segments.push({ kind: 'text', value: template.slice(last), gapId: 0 });
  }
  return segments;
}

/** Width of an inline field, adapted to the hint it carries (EF-4). */
export function gapWidth(hint: string | undefined): number {
  const length = Math.min(20, Math.max(6, hint?.length ?? 8));
  return Math.round(length * 9 + 24);
}

/** One cloze: the template, one field per gap and the correction gap by gap. */
export function ClozeView({
  brick,
  mode,
  correction,
  response,
  onResponse,
  disabled,
  testID,
}: NativeBrickViewProps) {
  const parsed = parsePublicPayload('cloze', brick.publicPayload);
  if (!parsed.ok) return <InvalidCharge type="cloze" testID={testID} />;
  const payload = parsed.payload;
  const graded = correction?.kind === 'cloze' ? correction : undefined;
  const values = clozeValues(response);
  const locked = mode === 'read' || disabled === true || graded !== undefined;
  const segments = templateSegments(payload.template);
  const total = payload.gaps.length;

  function setGap(gapId: number, value: string): void {
    if (locked) return;
    onResponse?.(clozeResponse({ ...values, [String(gapId)]: value }));
  }

  return (
    <BrickCard type="cloze" testID={testID}>
      <QuestionHeader instruction={t.clozeStem} type="cloze" />
      <View style={styles.template}>
        {segments.map((segment, index) => {
          if (segment.kind === 'text') {
            return (
              <Text key={`text-${String(index)}`} variant="body">
                {segment.value}
              </Text>
            );
          }
          const position = payload.gaps.findIndex((gap) => gap.id === segment.gapId);
          const gap = payload.gaps[position];
          const state = graded?.gaps.find((candidate) => candidate.id === segment.gapId);
          const correct = state?.correct === true;
          const wrong = state !== undefined && !state.correct;
          return (
            <View key={`gap-${String(segment.gapId)}`} style={styles.gap}>
              <TextInput
                accessibilityLabel={t.gapLabel(position + 1, total)}
                accessibilityState={{ disabled: locked }}
                editable={!locked}
                onChangeText={(value) => {
                  setGap(segment.gapId, value);
                }}
                placeholder={gap?.hint ?? ''}
                placeholderTextColor={theme.colors.inkMuted}
                style={[
                  styles.gapInput,
                  { width: gapWidth(gap?.hint) },
                  correct ? styles.gapCorrect : wrong ? styles.gapWrong : null,
                ]}
                testID={`brick-gap-${String(position)}`}
                value={values[String(segment.gapId)] ?? ''}
              />
              {state === undefined ? null : (
                <Text variant="caption" tone={state.correct ? 'success' : 'danger'}>
                  {t.answerExpected(state.expected)}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {graded === undefined ? null : (
        <Feedback explanation={graded.explanation} isCorrect={correctionIsCorrect(graded)} />
      )}
      <Sources sources={payload.sources} />
    </BrickCard>
  );
}

const styles = StyleSheet.create({
  template: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  gap: { alignItems: 'center' },
  gapInput: {
    minHeight: 44,
    borderRadius: theme.radius.control,
    borderBottomWidth: 2,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.canvas,
    paddingHorizontal: theme.spacing.sm,
    textAlign: 'center',
    color: theme.colors.ink,
    fontFamily: theme.fontFamilies.bodySemiBold,
    fontSize: typeScale.body.fontSize,
  },
  gapCorrect: { backgroundColor: theme.colors.greenSoft, borderColor: theme.colors.green },
  gapWrong: { backgroundColor: theme.colors.orangeSoft, borderColor: theme.colors.orange },
});
