import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { colors } from '../../src/tokens/colors';
import { fontFamilies, fontSizesPx } from '../../src/tokens/typography';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const REFERENCES = path.join(ROOT, 'design', 'references', 'tokens.json');
const MOCKUPS = path.join(ROOT, 'design', 'maquettes');

/** Colours of the notion map, declared by SPEC-616; not interface tokens (SPEC-301 EF-2). */
const DATA_PALETTE = ['#2DD4BF', '#FBBF24', '#F472B6', '#60A5FA', '#F87171'];

/**
 * CSS initial values emitted by the browser for unstyled `body` and transparent backgrounds.
 * They are observations, not design decisions (SPEC-301 ET-6, ADR-0268).
 */
const BROWSER_DEFAULT_COLORS = new Set(['#000000', 'rgba(0,0,0,0)']);

/** Default font-size of an unstyled `<button>` (13.3333px), also an observation (ET-6). */
const BROWSER_DEFAULT_FONT_SIZES = new Set(['13.3333px']);

interface TokenEntry {
  screenId: string;
  source: string;
  selector: string;
  property: string;
  value: string;
}

interface TokensFile {
  entries: TokenEntry[];
  distinct?: Record<string, string[]>;
}

function normalizeColor(raw: string): string {
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(raw);
  if (rgb) {
    const [, r, g, b, alpha] = rgb;
    if (alpha !== undefined && Number(alpha) < 1) {
      return `rgba(${String(Number(r))},${String(Number(g))},${String(Number(b))},${String(Number(alpha))})`;
    }
    return `#${[r, g, b]
      .map((part) => Number(part).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  }
  const hex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.exec(raw);
  if (!hex?.[1]) return raw;
  const value = hex[1];
  if (value.length === 3) {
    return `#${value
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toUpperCase()}`;
  }
  return `#${value.toUpperCase()}`;
}

function colorsOf(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)/g)) {
    if (match[0].startsWith('#') && match[0].length === 9) {
      // #RRGGBBAA: keep the RGB part, the alpha channel is not a design token here.
      found.push(normalizeColor(match[0].slice(0, 7)));
    } else {
      found.push(normalizeColor(match[0]));
    }
  }
  return found;
}

function mockupSources(): string[] {
  return fs
    .readdirSync(MOCKUPS)
    .filter((file) => file.endsWith('.dc.html') || file === 'support.js')
    .map((file) => path.join(MOCKUPS, file));
}

describe('[SPEC-301] conformité aux maquettes', () => {
  it('vérifie couleurs, tailles et familles de tokens.json (ET-6 a à d)', () => {
    if (!fs.existsSync(REFERENCES)) {
      throw new Error('design/references/tokens.json manquant : exécuter SPEC-005');
    }
    const tokensFile = JSON.parse(fs.readFileSync(REFERENCES, 'utf8')) as TokensFile;
    expect(Array.isArray(tokensFile.entries)).toBe(true);

    const referenceColors = new Set<string>();
    const fontSizes = new Set<string>();
    const families = new Set<string>();
    for (const entry of tokensFile.entries) {
      for (const color of colorsOf(entry.value)) referenceColors.add(color);
      if (/(font|size)/i.test(entry.property) && /^\d+(?:\.\d+)?px$/.test(entry.value)) {
        fontSizes.add(entry.value);
      }
      if (/Inter|Space Grotesk/.test(entry.value)) families.add(entry.value);
    }

    const mockupColors = new Set<string>();
    for (const file of mockupSources()) {
      for (const color of colorsOf(fs.readFileSync(file, 'utf8'))) mockupColors.add(color);
    }
    const supportJs = fs.readFileSync(path.join(MOCKUPS, 'support.js'), 'utf8');

    // (a) Every interface colour is observed in the mockups; `unread` is defined by support.js.
    const unknownTokens = Object.entries(colors).filter(
      ([, value]) => !mockupColors.has(normalizeColor(value)),
    );
    expect(unknownTokens, 'couleurs de jeton absentes des maquettes').toEqual([]);
    expect(normalizeColor('#F5F5FD')).toBe(colors.unread);
    expect(supportJs.toUpperCase()).toContain('#F5F5FD');

    // (b) Every colour of the reference inventory belongs to the tokens or to the data palette.
    const tokenValues = new Set(Object.values(colors).map((value) => normalizeColor(value)));
    const extraReferenceColors = [...referenceColors].filter(
      (color) =>
        !tokenValues.has(color) &&
        !DATA_PALETTE.includes(color) &&
        !BROWSER_DEFAULT_COLORS.has(color),
    );
    expect(extraReferenceColors, 'couleurs de référence sans jeton').toEqual([]);

    // (c) Every declared font size is a token; the UA button size is ignored.
    const knownSizes = new Set(fontSizesPx.map((size) => `${String(size)}px`));
    const unknownSizes = [...fontSizes].filter(
      (size) => !knownSizes.has(size) && !BROWSER_DEFAULT_FONT_SIZES.has(size),
    );
    expect(unknownSizes, 'tailles de référence sans jeton').toEqual([]);

    // (d) Both product families are observed in the mockups.
    const joinedFamilies = [...families].join(' | ');
    expect(joinedFamilies).toContain('Inter');
    expect(joinedFamilies).toContain('Space Grotesk');
    expect(Object.values(fontFamilies).join(' | ')).toContain('Inter');

    // Evidence report: the exact colour universe that was compared.
    const report = {
      checkedAt: '2026-11-11T12:20:00Z',
      referenceColors: [...referenceColors].sort(),
      mockupColors: [...mockupColors].sort(),
      tokenColors: Object.fromEntries(
        Object.entries(colors).map(([name, value]) => [name, normalizeColor(value)]),
      ),
      dataPalette: DATA_PALETTE,
      fontSizes: [...fontSizes].sort(),
      families: [...families].sort(),
    };
    const reportDir = path.join(ROOT, 'test-results', 'sdd', 'SPEC-301');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'tokens-report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    );
  });
});
