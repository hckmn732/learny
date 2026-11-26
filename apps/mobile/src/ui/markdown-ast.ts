// Markdown -> block tree (SPEC-3301 ET-3, ADR-3009 § 3).
//
// The course text and several bricks carry Markdown (BR-COU-01). The mobile application never
// renders it in a WebView: `mdast-util-from-markdown` parses it (GFM tables through
// `mdast-util-gfm-table`) and this module normalises the tree into the small vocabulary that
// `ui/Markdown.tsx` renders with the `Text` of the theme. Raw HTML never reaches the tree: mdast
// produces `html` nodes, which are ignored here — the policy of `rehype-sanitize` on the web (CL-5).
//
// Pure: no React Native import, so Vitest covers it (SPEC-3301 § 12).

import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';

import { withReadableMath } from '../lib/latex-text';

/** Inline run of a paragraph, a heading, a list item or a table cell. */
export type Inline =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'strong'; readonly children: readonly Inline[] }
  | { readonly kind: 'emphasis'; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly url: string; readonly children: readonly Inline[] }
  | { readonly kind: 'break' };

/** Kinds of callout the charge may carry (EF-7). */
export type CalloutTone = 'takeaway' | 'comparison' | 'quick';

export type Block =
  | { readonly kind: 'heading'; readonly depth: number; readonly children: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly children: readonly Inline[] }
  | {
      readonly kind: 'list';
      readonly ordered: boolean;
      readonly start: number;
      readonly items: readonly (readonly Inline[])[];
    }
  | { readonly kind: 'quote'; readonly children: readonly Block[] }
  | {
      readonly kind: 'callout';
      readonly tone: CalloutTone;
      readonly label: string;
      readonly children: readonly Block[];
      readonly answer: readonly Block[];
    }
  | { readonly kind: 'code'; readonly value: string; readonly lang: string | null }
  | {
      readonly kind: 'table';
      readonly head: readonly (readonly Inline[])[];
      readonly rows: readonly (readonly (readonly Inline[])[])[];
    }
  | { readonly kind: 'image'; readonly alt: string; readonly url: string }
  | { readonly kind: 'rule' };

/** The three callouts of the course charge, in the wording of `fr.course` (EF-7). */
export const CALLOUTS: readonly { readonly tone: CalloutTone; readonly label: string }[] = [
  { tone: 'takeaway', label: 'À retenir' },
  { tone: 'comparison', label: 'Ne pas confondre' },
  { tone: 'quick', label: 'Question éclair' },
];

/** Structural view of an mdast node: only the fields this module reads. */
interface MarkdownNode {
  readonly type: string;
  readonly value?: string | undefined;
  readonly url?: string | undefined;
  readonly alt?: string | null | undefined;
  readonly lang?: string | null | undefined;
  readonly depth?: number | undefined;
  readonly ordered?: boolean | null | undefined;
  readonly start?: number | null | undefined;
  readonly children?: readonly MarkdownNode[] | undefined;
}

const PARSE_OPTIONS = {
  extensions: [gfmTable()],
  mdastExtensions: [gfmTableFromMarkdown()],
};

const EMPTY: readonly Block[] = [];
const EMPTY_INLINE: readonly Inline[] = [];

/** Lower-case, accent-free form used to recognise a callout label (« éclair » = « eclair »). */
function normalizeLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * URL accepted by a link of the charge. Only `http(s)`, `mailto` and relative paths reach the
 * renderer; any other scheme (`javascript:`, `data:`, `file:`) becomes an empty string and the
 * link text stays plain (CL-5).
 */
export function safeMarkdownUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '' || trimmed.startsWith('//')) return '';
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '';
  return trimmed;
}

function inlineChildren(node: MarkdownNode): readonly Inline[] {
  const children = node.children ?? [];
  return children.flatMap((child) => inlines(child));
}

function inlines(node: MarkdownNode): readonly Inline[] {
  switch (node.type) {
    case 'text':
      return node.value === undefined ? EMPTY_INLINE : [{ kind: 'text', value: node.value }];
    case 'inlineCode':
      return node.value === undefined ? EMPTY_INLINE : [{ kind: 'code', value: node.value }];
    case 'strong':
      return [{ kind: 'strong', children: inlineChildren(node) }];
    case 'emphasis':
      return [{ kind: 'emphasis', children: inlineChildren(node) }];
    case 'delete':
      // GFM strikethrough has no native style: the text stays readable (ADR-3009 § 3).
      return inlineChildren(node);
    case 'link': {
      const url = safeMarkdownUrl(node.url ?? '');
      const children = inlineChildren(node);
      return url === '' ? children : [{ kind: 'link', url, children }];
    }
    case 'break':
      return [{ kind: 'break' }];
    case 'image': {
      // Images are not displayed in V1: the alternative text stands in for them (ET-3, § 15).
      const alt = (node.alt ?? '').trim();
      return alt === '' ? EMPTY_INLINE : [{ kind: 'text', value: `[${alt}]` }];
    }
    case 'html':
    case 'footnoteReference':
    case 'definition':
      return EMPTY_INLINE;
    default:
      return node.children === undefined ? EMPTY_INLINE : inlineChildren(node);
  }
}

/** A paragraph whose only child is an image carries no running text (§ 15). */
function imageParagraph(node: MarkdownNode): readonly Block[] | null {
  const children = node.children ?? [];
  const first = children[0];
  if (children.length !== 1 || first?.type !== 'image') return null;
  return [{ kind: 'image', alt: (first.alt ?? '').trim(), url: (first.url ?? '').trim() }];
}

function listItem(node: MarkdownNode): readonly Inline[] {
  const parts = blocks(node);
  const runs: Inline[] = [];
  for (const part of parts) {
    if (part.kind === 'paragraph' || part.kind === 'heading') {
      if (runs.length > 0) runs.push({ kind: 'break' });
      runs.push(...part.children);
    }
  }
  return runs;
}

function isPlainStrong(node: MarkdownNode): boolean {
  const children = node.children ?? [];
  const first = children[0];
  return children.length === 1 && first?.type === 'strong';
}

function calloutTone(node: MarkdownNode): { tone: CalloutTone; label: string } | null {
  const children = node.children ?? [];
  const first = children[0];
  if (first === undefined || first.type !== 'paragraph' || !isPlainStrong(first)) return null;
  const strong = (first.children ?? [])[0];
  const text = normalizeLabel(strong?.children?.[0]?.value ?? '');
  if (text === '') return null;
  for (const callout of CALLOUTS) {
    if (text.startsWith(normalizeLabel(callout.label))) {
      return { tone: callout.tone, label: callout.label };
    }
  }
  return null;
}

/**
 * A callout is a blockquote whose first paragraph is a single bold label. The rest of that
 * paragraph, then the remaining blocks, form the body; a thematic break separates the visible
 * question from the hidden answer of « Question éclair » (EF-7).
 */
function calloutBlocks(node: MarkdownNode): readonly Block[] {
  const children = node.children ?? [];
  const label = calloutTone(node);
  if (label === null) return quoteBlocks(node);
  const [first, ...rest] = children;
  const tail = (first?.children ?? []).slice(1);
  const body: Block[] = [];
  const inlineTail = tail.flatMap((child) => inlines(child));
  if (inlineTail.length > 0) body.push({ kind: 'paragraph', children: inlineTail });
  const after: Block[] = [...body, ...rest.flatMap((child) => blocks(child))];
  const breakIndex = after.findIndex((block) => block.kind === 'rule');
  const visible = breakIndex === -1 ? after : after.slice(0, breakIndex);
  const hidden = breakIndex === -1 ? EMPTY : after.slice(breakIndex + 1);
  return [
    {
      kind: 'callout',
      tone: label.tone,
      label: label.label,
      children: visible,
      answer: hidden,
    },
  ];
}

function quoteBlocks(node: MarkdownNode): readonly Block[] {
  return [{ kind: 'quote', children: (node.children ?? []).flatMap((child) => blocks(child)) }];
}

function tableBlock(node: MarkdownNode): readonly Block[] {
  const rows = (node.children ?? []).flatMap((row) => {
    const cells = (row.children ?? []).map((cell) => inlines(cell));
    return cells.length === 0 ? [] : [cells];
  });
  const [head, ...rest] = rows;
  if (head === undefined) return EMPTY;
  return [{ kind: 'table', head, rows: rest }];
}

function blocks(node: MarkdownNode): readonly Block[] {
  switch (node.type) {
    case 'root':
    case 'listItem':
      return (node.children ?? []).flatMap((child) => blocks(child));
    case 'heading':
      return [
        {
          kind: 'heading',
          depth: Math.min(6, Math.max(1, node.depth ?? 1)),
          children: inlineChildren(node),
        },
      ];
    case 'paragraph':
      return imageParagraph(node) ?? [{ kind: 'paragraph', children: inlineChildren(node) }];
    case 'list':
      return [
        {
          kind: 'list',
          ordered: node.ordered === true,
          start: node.start ?? 1,
          items: (node.children ?? []).map((item) => listItem(item)),
        },
      ];
    case 'blockquote':
      return calloutBlocks(node);
    case 'code':
      return [{ kind: 'code', value: node.value ?? '', lang: node.lang ?? null }];
    case 'table':
      return tableBlock(node);
    case 'thematicBreak':
      return [{ kind: 'rule' }];
    case 'html':
    case 'definition':
    case 'footnoteDefinition':
      return EMPTY;
    case 'image':
      return [{ kind: 'image', alt: (node.alt ?? '').trim(), url: (node.url ?? '').trim() }];
    default: {
      const children = node.children ?? [];
      return children.length === 0
        ? EMPTY
        : [{ kind: 'paragraph', children: inlineChildren(node) }];
    }
  }
}

/** Parses one Markdown string of the charge into the block tree of the renderer. */
export function parseMarkdown(markdown: string): readonly Block[] {
  if (markdown.trim() === '') return EMPTY;
  const root = fromMarkdown(withReadableMath(markdown), PARSE_OPTIONS) as unknown as MarkdownNode;
  return blocks(root);
}
