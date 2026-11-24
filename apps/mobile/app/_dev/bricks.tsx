// `/_dev/bricks` — visual review gallery of the thirteen brick types (SPEC-3301 EF-8, § 10).
//
// Every `brickExamples` entry is rendered in reading mode, in playing mode and corrected, with the
// public projection of its payload and the correction `gradeBrick` produces: the gallery can only
// show a state the application really reaches. Test builds only (ADR-0131): without
// `EXPO_PUBLIC_ENABLE_SDD_PAGES` the route sends the user home.
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { BrickType, RecallSelfGrade } from '@learny/bricks';
import { fr } from '@learny/i18n';

import type { BrickMode, ShowcaseBrick } from '../../src/bricks';
import { BrickView, recallResponse, SHOWCASE_BRICKS } from '../../src/bricks';
import { configResult } from '../../src/config';
import { openOnWeb } from '../../src/lib/web';
import { theme } from '../../src/theme';
import { Button, LargeTitleHeader, Segmented, Text } from '../../src/ui';
import { Markdown } from '../../src/ui/Markdown';

const t = fr.mobile.bricks;
const g = t.gallery;

/** The interactive bricks first: the visual review sees them without scrolling (§ 10). */
const ORDER: readonly BrickType[] = [
  'choice_question',
  'recall_card',
  'matching',
  'cloze',
  'ordering',
  'categorization',
  'open_question',
  'text',
  'resource_excerpt',
  'instruction',
  'scripted_dialogue',
  'timer',
  'scoring',
];

const MARKDOWN_SAMPLE = [
  '## Titre de section',
  '',
  'Un paragraphe avec du **gras**, de l’*italique*, du `code en ligne` et un [lien vers Learny](https://learny.app/cours).',
  '',
  '- premier point',
  '- deuxième point',
  '',
  '| Clé | Sens |',
  '| --- | --- |',
  '| 40 | Débit |',
  '| 50 | Crédit |',
  '',
  '> **À retenir**',
  '>',
  '> Chaque écriture respecte la partie double.',
  '',
  '> **Ne pas confondre**',
  '>',
  '> Débit et crédit ne veulent pas dire perte et gain.',
  '',
  '> **Question éclair · avant de lire la suite**',
  '>',
  '> Que dit le principe de la partie double ?',
  '>',
  '> ---',
  '>',
  '> Chaque écriture a un débit et un crédit de même montant.',
  '',
  '```ts',
  'const total = debit + credit;',
  '```',
].join('\n');

function RecallActions({ onGrade }: { readonly onGrade: (grade: RecallSelfGrade) => void }) {
  return (
    <View style={styles.row}>
      <Button
        label={g.actions.review}
        onPress={() => {
          onGrade('again');
        }}
        size="sm"
        testID="gallery-recall-review"
        variant="outline"
      />
      <Button
        label={g.actions.knew}
        onPress={() => {
          onGrade('good');
        }}
        size="sm"
        testID="gallery-recall-knew"
      />
    </View>
  );
}

/** Mode of the review: `corrected` is the playing mode with the correction of the server. */
type GalleryMode = 'read' | 'play' | 'corrected';

function BrickSection({
  entry,
  mode,
  response,
  onResponse,
}: {
  readonly entry: ShowcaseBrick;
  readonly mode: GalleryMode;
  readonly response: unknown;
  readonly onResponse: (value: unknown) => void;
}) {
  const brickMode: BrickMode = mode === 'read' ? 'read' : 'play';
  return (
    <View style={styles.section} testID={`gallery-brick-${entry.type}`}>
      <View style={styles.sectionHeader}>
        <Text variant="label" tone="muted" testID={`gallery-label-${entry.type}`}>
          {t.types[entry.type]}
        </Text>
        <Text variant="caption" tone="muted">
          {entry.type}
        </Text>
      </View>
      <BrickView
        actions={
          entry.type === 'recall_card' && brickMode === 'play' ? (
            <RecallActions
              onGrade={(grade) => {
                onResponse(recallResponse(grade));
              }}
            />
          ) : undefined
        }
        brick={entry.brick}
        correction={mode === 'corrected' ? (entry.correction ?? undefined) : undefined}
        mode={brickMode}
        onOpenResource={() => undefined}
        onOpenWeb={() => {
          void openOnWeb('/programme').catch(() => undefined);
        }}
        onResponse={onResponse}
        response={response}
      />
    </View>
  );
}

export default function BricksGalleryRoute() {
  const [mode, setMode] = useState<GalleryMode>('read');
  const [responses, setResponses] = useState<Readonly<Record<string, unknown>>>({});

  if (!configResult.ok || !configResult.config.enableSddPages) return <Redirect href="/" />;

  const known = new Map(SHOWCASE_BRICKS.map((entry) => [entry.type, entry]));
  const entries = ORDER.flatMap((type) => {
    const entry = known.get(type);
    return entry === undefined ? [] : [entry];
  });

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        testID="bricks-gallery"
      >
        <LargeTitleHeader eyebrow={g.eyebrow} testID="bricks-header" title={g.title} />
        <Text variant="bodySmall" tone="secondary">
          {g.intro}
        </Text>
        <View style={styles.modeBlock}>
          <Segmented
            label={g.mode}
            onChange={(value) => {
              setMode(value === 'play' ? 'play' : value === 'corrected' ? 'corrected' : 'read');
            }}
            options={[
              { value: 'read', label: g.read },
              { value: 'play', label: g.play },
              { value: 'corrected', label: g.corrected },
            ]}
            testID="bricks-mode"
            value={mode}
          />
        </View>

        {entries.map((entry) => (
          <BrickSection
            entry={entry}
            key={entry.type}
            mode={mode}
            onResponse={(value) => {
              setResponses((current) => ({ ...current, [entry.type]: value }));
            }}
            response={responses[entry.type]}
          />
        ))}

        <View style={styles.section} testID="gallery-markdown">
          <Text variant="label" tone="muted">
            {g.markdownTitle}
          </Text>
          <Markdown markdown={MARKDOWN_SAMPLE} testID="gallery-markdown-body" />
        </View>
        <Text variant="caption" tone="muted" style={styles.footer}>
          {g.footer}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.canvas },
  content: { paddingBottom: theme.spacing.huge, gap: theme.spacing.lg },
  modeBlock: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.xs },
  section: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: theme.spacing.md },
  footer: { paddingHorizontal: theme.spacing.xl },
});
