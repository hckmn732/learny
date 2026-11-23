// Markdown of the charge (SPEC-3301 ET-3, EF-7, ADR-3009 § 3).
//
// The AST of `markdown-ast.ts` is rendered with `Text` of React Native and the styles of the
// theme: no WebView, no DOM, no raw HTML (CL-5). Links carry `accessibilityRole="link"` and open
// in the in-app browser; tables scroll horizontally; images are not displayed in V1, their
// alternative text stands in for them.
//
// A run is a `Text` that carries inline children, so the component uses React Native's `Text`
// directly (`RNText`) and never the single-string `Text` of the design system: nested runs are
// what makes bold, links and code work inside a paragraph. `useMemo` keeps the parse out of the
// re-render of a screen that types in a neighbouring field (ET-5).
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { fr } from '@learny/i18n';

import { openExternal } from '../lib/web';
import { platform, radius, theme, typeScale } from '../theme';

import { Icon } from './Icon';
import type { Block, CalloutTone, Inline } from './markdown-ast';
import { parseMarkdown } from './markdown-ast';

const t = fr.mobile.bricks;
const MONOSPACE = platform === 'ios' ? 'Menlo' : 'monospace';
const BODY_FONT = typeScale[platform].body.fontSize;
const CODE_FONT = BODY_FONT - 1;

const TEXT_COLORS = {
  primary: theme.colors.ink,
  secondary: theme.colors.inkSecondary,
  muted: theme.colors.inkMuted,
  inverse: theme.colors.white,
  onDarkSecondary: theme.colors.onDarkSecondary,
  indigoInk: theme.colors.indigoInk,
  danger: theme.colors.danger,
} as const;

type RunTone = keyof typeof TEXT_COLORS;
type RunVariant =
  | 'sectionTitle'
  | 'title'
  | 'rowTitle'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'label'
  | 'buttonSmall';

interface RunProps {
  readonly children: ReactNode;
  readonly variant?: RunVariant;
  readonly tone?: RunTone;
  readonly style?: StyleProp<TextStyle>;
  readonly testID?: string | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly accessibilityRole?: 'text' | 'link' | 'button' | 'header' | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly accessibilityState?: { readonly expanded?: boolean } | undefined;
  readonly numberOfLines?: number | undefined;
}

/** One run of text of the theme: the only text primitive of the Markdown renderer. */
function Run({
  children,
  variant = 'body',
  tone = 'primary',
  style,
  testID,
  onPress,
  accessibilityRole,
  accessibilityHint,
  accessibilityState,
  numberOfLines,
}: RunProps) {
  return (
    <RNText
      allowFontScaling
      {...(testID === undefined ? {} : { testID })}
      {...(numberOfLines === undefined ? {} : { numberOfLines })}
      {...(onPress === undefined ? {} : { onPress })}
      {...(accessibilityRole === undefined ? {} : { accessibilityRole })}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...(accessibilityState === undefined ? {} : { accessibilityState })}
      style={[theme.type[variant], { color: TEXT_COLORS[tone] }, style]}
    >
      {children}
    </RNText>
  );
}

export interface MarkdownProps {
  readonly markdown: string;
  /** Overrides the default opener of the in-app browser (tests, screens with their own routing). */
  readonly onLinkPress?: ((url: string) => void) | undefined;
  readonly testID?: string | undefined;
}

function openLink(url: string, onLinkPress?: (url: string) => void): void {
  if (onLinkPress !== undefined) {
    onLinkPress(url);
    return;
  }
  try {
    void openExternal(url).catch(() => undefined);
  } catch {
    // Without an installed browser (a component test) a link simply does nothing.
  }
}

function inlineKey(node: Inline, index: number): string {
  switch (node.kind) {
    case 'link':
      return `link-${String(index)}-${node.url}`;
    case 'text':
      return `text-${String(index)}-${node.value.slice(0, 12)}`;
    default:
      return `${node.kind}-${String(index)}`;
  }
}

function Inlines({
  nodes,
  onLinkPress,
}: {
  readonly nodes: readonly Inline[];
  readonly onLinkPress?: ((url: string) => void) | undefined;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const key = inlineKey(node, index);
        switch (node.kind) {
          case 'text':
            return <Run key={key}>{node.value}</Run>;
          case 'strong':
            return (
              <Run key={key} style={styles.strong}>
                <Inlines nodes={node.children} onLinkPress={onLinkPress} />
              </Run>
            );
          case 'emphasis':
            return (
              <Run key={key} style={styles.emphasis}>
                <Inlines nodes={node.children} onLinkPress={onLinkPress} />
              </Run>
            );
          case 'code':
            return (
              <Run key={key} style={styles.code}>
                {node.value}
              </Run>
            );
          case 'link':
            return (
              <Run
                accessibilityHint={t.markdownLinkHint}
                accessibilityRole="link"
                key={key}
                onPress={() => {
                  openLink(node.url, onLinkPress);
                }}
                style={styles.link}
              >
                <Inlines nodes={node.children} onLinkPress={onLinkPress} />
              </Run>
            );
          case 'break':
            return <Run key={key}>{'\n'}</Run>;
        }
      })}
    </>
  );
}

function headingVariant(depth: number): RunVariant {
  if (depth <= 2) return 'sectionTitle';
  if (depth === 3) return 'title';
  return 'rowTitle';
}

function CalloutCard({
  tone,
  label,
  body,
  answer,
  onLinkPress,
}: {
  readonly tone: CalloutTone;
  readonly label: string;
  readonly body: readonly Block[];
  readonly answer: readonly Block[];
  readonly onLinkPress?: ((url: string) => void) | undefined;
}) {
  const [revealed, setRevealed] = useState(false);
  const dark = tone === 'takeaway';
  const background = dark ? theme.colors.ink : theme.colors.orangeSoft;
  const labelTone: RunTone = dark ? 'inverse' : 'danger';
  const bodyTone: RunTone = dark ? 'onDarkSecondary' : 'primary';
  return (
    <View
      testID={`brick-callout-${tone}`}
      style={[styles.callout, { backgroundColor: background }]}
    >
      <View style={styles.calloutHeader}>
        <Icon
          color={dark ? theme.colors.lime : theme.colors.orangeInk}
          name={dark ? 'check' : 'alert'}
          size={16}
        />
        <Run tone={labelTone} variant="label">
          {label}
        </Run>
      </View>
      <Blocks nodes={body} onLinkPress={onLinkPress} tone={bodyTone} />
      {answer.length === 0 ? null : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: revealed }}
            onPress={() => {
              setRevealed(!revealed);
            }}
            testID="brick-callout-reveal"
          >
            <Run tone={dark ? 'inverse' : 'indigoInk'} variant="buttonSmall">
              {revealed ? t.hideAnswer : t.showAnswer}
            </Run>
          </Pressable>
          {revealed ? <Blocks nodes={answer} onLinkPress={onLinkPress} tone={bodyTone} /> : null}
        </>
      )}
    </View>
  );
}

function Table({
  head,
  rows,
  onLinkPress,
}: {
  readonly head: readonly (readonly Inline[])[];
  readonly rows: readonly (readonly (readonly Inline[])[])[];
  readonly onLinkPress?: ((url: string) => void) | undefined;
}) {
  return (
    <ScrollView
      accessibilityLabel={t.markdownTable}
      horizontal
      showsHorizontalScrollIndicator={false}
      testID="brick-markdown-table"
    >
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHead]}>
          {head.map((cell, index) => (
            <View key={`h-${String(index)}`} style={styles.tableCell}>
              <Run style={styles.strong} variant="label">
                <Inlines nodes={cell} onLinkPress={onLinkPress} />
              </Run>
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View key={`r-${String(rowIndex)}`} style={styles.tableRow}>
            {row.map((cell, index) => (
              <View key={`c-${String(rowIndex)}-${String(index)}`} style={styles.tableCell}>
                <Run variant="bodySmall">
                  <Inlines nodes={cell} onLinkPress={onLinkPress} />
                </Run>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Blocks({
  nodes,
  tone = 'primary',
  onLinkPress,
}: {
  readonly nodes: readonly Block[];
  readonly tone?: RunTone;
  readonly onLinkPress?: ((url: string) => void) | undefined;
}) {
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.kind}-${String(index)}`;
        switch (node.kind) {
          case 'heading':
            return (
              <Run key={key} tone={tone} variant={headingVariant(node.depth)}>
                <Inlines nodes={node.children} onLinkPress={onLinkPress} />
              </Run>
            );
          case 'paragraph':
            return (
              <Run key={key} tone={tone} variant="body">
                <Inlines nodes={node.children} onLinkPress={onLinkPress} />
              </Run>
            );
          case 'list':
            return (
              <View key={key} style={styles.list}>
                {node.items.map((item, itemIndex) => (
                  <View key={`i-${String(itemIndex)}`} style={styles.listItem}>
                    <Run tone={tone} variant="body">
                      {node.ordered ? `${String(node.start + itemIndex)}.` : '•'}
                    </Run>
                    <Run style={styles.listText} tone={tone} variant="body">
                      <Inlines nodes={item} onLinkPress={onLinkPress} />
                    </Run>
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={key} style={styles.quote}>
                <Blocks nodes={node.children} onLinkPress={onLinkPress} tone={tone} />
              </View>
            );
          case 'callout':
            return (
              <CalloutCard
                answer={node.answer}
                body={node.children}
                key={key}
                label={node.label}
                onLinkPress={onLinkPress}
                tone={node.tone}
              />
            );
          case 'code':
            return (
              <View key={key} accessibilityLabel={t.markdownCode} style={styles.codeBlock}>
                <Run style={styles.codeText}>{node.value}</Run>
              </View>
            );
          case 'table':
            return <Table head={node.head} key={key} onLinkPress={onLinkPress} rows={node.rows} />;
          case 'image':
            return (
              <Run key={key} tone="muted" variant="caption">
                {t.markdownImage(node.alt)}
              </Run>
            );
          case 'rule':
            return <View key={key} style={styles.rule} />;
        }
      })}
    </>
  );
}

/** Renders one Markdown string of the charge with the styles of the theme (ET-3). */
export function Markdown({ markdown, onLinkPress, testID }: MarkdownProps) {
  const nodes = useMemo(() => parseMarkdown(markdown), [markdown]);
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.root}>
      <Blocks nodes={nodes} onLinkPress={onLinkPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: theme.spacing.md },
  strong: { fontFamily: theme.fontFamilies.bodySemiBold },
  emphasis: { fontStyle: 'italic' },
  code: { fontFamily: MONOSPACE, fontSize: CODE_FONT },
  link: { color: theme.colors.indigoInk, textDecorationLine: 'underline' },
  list: { gap: theme.spacing.xs },
  listItem: { flexDirection: 'row', gap: theme.spacing.sm },
  listText: { flex: 1 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.lime,
    paddingLeft: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  callout: { borderRadius: radius.card, padding: theme.spacing.lg, gap: theme.spacing.md },
  calloutHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  codeBlock: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: radius.control,
    padding: theme.spacing.md,
  },
  codeText: { fontFamily: MONOSPACE, fontSize: CODE_FONT, color: theme.colors.ink },
  table: {
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    minWidth: 320,
  },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.divider },
  tableHead: { backgroundColor: theme.colors.canvas, borderTopWidth: 0 },
  tableCell: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minWidth: 120,
  },
  rule: { height: 1, backgroundColor: theme.colors.divider },
});
