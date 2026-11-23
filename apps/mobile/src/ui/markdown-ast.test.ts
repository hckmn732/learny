// Vitest [SPEC-3301] — Markdown AST of the charge (ET-3, EF-7, CL-5).
import { describe, expect, it } from 'vitest';

import type { Block, Inline } from './markdown-ast';
import { parseMarkdown, safeMarkdownUrl } from './markdown-ast';

function kinds(blocks: readonly Block[]): readonly string[] {
  return blocks.map((block) => block.kind);
}

function firstParagraph(blocks: readonly Block[]): readonly Inline[] {
  for (const block of blocks) {
    if (block.kind === 'paragraph') return block.children;
  }
  return [];
}

function textOf(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case 'text':
        case 'code':
          return node.value;
        case 'strong':
        case 'emphasis':
        case 'link':
          return textOf(node.children);
        case 'break':
          return '\n';
      }
    })
    .join('');
}

describe('[SPEC-3301] Markdown du contenu', () => {
  it('[SPEC-3301] rend les titres, les paragraphes, le gras, l’italique et le code (ET-3)', () => {
    const blocks = parseMarkdown('## Titre\n\nUn **gras**, une *italique* et du `code`.');
    expect(kinds(blocks)).toEqual(['heading', 'paragraph']);
    const heading = blocks[0];
    expect(heading?.kind === 'heading' && heading.depth).toBe(2);
    const children = firstParagraph(blocks);
    expect(children.map((node) => node.kind)).toContain('strong');
    expect(children.map((node) => node.kind)).toContain('emphasis');
    expect(children.map((node) => node.kind)).toContain('code');
    expect(textOf(children)).toBe('Un gras, une italique et du code.');
  });

  it('[SPEC-3301] rend les listes ordonnées et non ordonnées', () => {
    const unordered = parseMarkdown('- un\n- deux\n');
    const ordered = parseMarkdown('1. un\n2. deux\n');
    expect(unordered[0]?.kind === 'list' && unordered[0].items).toHaveLength(2);
    expect(ordered[0]?.kind === 'list' && ordered[0].ordered).toBe(true);
    expect(ordered[0]?.kind === 'list' && ordered[0].start).toBe(1);
  });

  it('[SPEC-3301] rend un tableau GFM avec son en-tête (ET-3)', () => {
    const blocks = parseMarkdown('| Clé | Sens |\n| --- | --- |\n| 40 | Débit |\n');
    const table = blocks.find((block) => block.kind === 'table');
    expect(table?.kind).toBe('table');
    if (table?.kind !== 'table') return;
    expect(textOf(table.head[0] ?? [])).toBe('Clé');
    expect(table.rows).toHaveLength(1);
    expect(textOf(table.rows[0]?.[1] ?? [])).toBe('Débit');
  });

  it('[SPEC-3301] rend une citation simple en bloc de citation', () => {
    const blocks = parseMarkdown('> Une citation.\n');
    expect(kinds(blocks)).toEqual(['quote']);
  });

  it('[SPEC-3301] reconnaît les trois blocs de la charge (EF-7)', () => {
    const blocks = parseMarkdown(
      '> **À retenir**\n>\n> La partie double.\n\n> **Ne pas confondre**\n>\n> Débit et crédit.\n',
    );
    expect(kinds(blocks)).toEqual(['callout', 'callout']);
    const [takeaway, comparison] = blocks;
    expect(takeaway?.kind === 'callout' && takeaway.tone).toBe('takeaway');
    expect(comparison?.kind === 'callout' && comparison.tone).toBe('comparison');
  });

  it('[SPEC-3301] cache la réponse de la question éclair derrière un séparateur (EF-7)', () => {
    const blocks = parseMarkdown(
      '> **Question éclair · avant de lire la suite**\n>\n> Que dit le principe ?\n>\n> ---\n>\n> Chaque écriture a deux montants.\n',
    );
    expect(blocks[0]?.kind).toBe('callout');
    const callout = blocks[0];
    if (callout?.kind !== 'callout') return;
    expect(callout.tone).toBe('quick');
    expect(callout.children).toHaveLength(1);
    expect(callout.answer.length).toBeGreaterThan(0);
    expect(textOf(firstParagraph(callout.answer))).toBe('Chaque écriture a deux montants.');
  });

  it('[SPEC-3301] ignore le HTML brut et les scripts (CL-5)', () => {
    const blocks = parseMarkdown('<div>caché</div>\n\nUn paragraphe <script>alert(1)</script>.\n');
    const paragraphs = blocks.filter((block) => block.kind === 'paragraph');
    const text = paragraphs.map((block) => textOf(block.children)).join(' ');
    expect(text).not.toContain('<script>');
    expect(text).not.toContain('<div>');
  });

  it('[SPEC-3301] refuse un lien javascript: mais garde son texte (CL-5)', () => {
    const blocks = parseMarkdown('[cliquez](javascript:alert(1))\n');
    const children = firstParagraph(blocks);
    expect(children.some((node) => node.kind === 'link')).toBe(false);
    expect(textOf(children)).toBe('cliquez');
  });

  it('[SPEC-3301] garde un lien http et son adresse (ET-3)', () => {
    const blocks = parseMarkdown('[Learny](https://learny.app/cours)\n');
    const link = firstParagraph(blocks).find((node) => node.kind === 'link');
    expect(link?.kind === 'link' && link.url).toBe('https://learny.app/cours');
  });

  it('[SPEC-3301] affiche le texte alternatif d’une image (ET-3)', () => {
    expect(kinds(parseMarkdown('![Schéma de la partie double](schema.png)\n'))).toEqual(['image']);
    const blocks = parseMarkdown('Un texte ![Schéma](schema.png) ici.\n');
    expect(textOf(firstParagraph(blocks))).toContain('[Schéma]');
  });

  it('[SPEC-3301] rend un bloc de code et une règle', () => {
    const blocks = parseMarkdown('```ts\nconst a = 1;\n```\n\n---\n');
    expect(kinds(blocks)).toEqual(['code', 'rule']);
  });

  it('[SPEC-3301] accepte une chaîne vide', () => {
    expect(parseMarkdown('')).toEqual([]);
  });

  it('[SPEC-3301] filtre les schémas d’URL (CL-5)', () => {
    expect(safeMarkdownUrl('https://learny.app')).toBe('https://learny.app');
    expect(safeMarkdownUrl('mailto:tuteur@learny.app')).toBe('mailto:tuteur@learny.app');
    expect(safeMarkdownUrl('/cours/42')).toBe('/cours/42');
    expect(safeMarkdownUrl('javascript:alert(1)')).toBe('');
    expect(safeMarkdownUrl('data:text/html,<b>x</b>')).toBe('');
    expect(safeMarkdownUrl('//evil.example')).toBe('');
    expect(safeMarkdownUrl('   ')).toBe('');
  });
});
