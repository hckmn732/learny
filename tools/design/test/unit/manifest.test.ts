import { describe, expect, it } from 'vitest';

import {
  buildManifest,
  buildTokens,
  FIXED_AT,
  LOCALE,
  manifestEntry,
  pngSize,
  referenceFile,
  sha256,
  sortEntries,
  sourceFile,
  TIME_ZONE,
  toJson,
  tokenEntries,
  validateScenarios,
  ZOOM,
} from '../../manifest.mjs';
import type { ReferenceEntry, Scenario, TokenEntry } from '../../manifest.mjs';

// 1×1 transparent PNG, enough to exercise the IHDR reader and the SHA-256 computation.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    screenId: 'SCR-01',
    state: 'base',
    source: 'Inscription.dc.html',
    setup: () => Promise.resolve(),
    expect: () => Promise.resolve(),
    ...overrides,
  };
}

function entry(overrides: Partial<ReferenceEntry> = {}): ReferenceEntry {
  return {
    screenId: 'SCR-01',
    state: 'base',
    viewport: 'desktop',
    viewportWidth: 1440,
    viewportHeight: 900,
    source: 'design/maquettes/Inscription.dc.html',
    file: 'design/references/SCR-01-base-desktop.png',
    width: 1,
    height: 1,
    fixedAt: FIXED_AT,
    locale: LOCALE,
    timeZone: TIME_ZONE,
    zoom: ZOOM,
    sha256: sha256(PNG_1X1),
    ...overrides,
  };
}

describe('[SPEC-005] manifest', () => {
  it('nomme les fichiers par écran, état et viewport', () => {
    expect(referenceFile('SCR-01', 'base', 'desktop')).toBe('SCR-01-base-desktop.png');
    expect(sourceFile('Programme.dc.html?proposition#top')).toBe('Programme.dc.html');
    expect(sourceFile('Inscription.dc.html')).toBe('Inscription.dc.html');
  });

  it('accepte une table de scénarios complète', () => {
    expect(validateScenarios([scenario()], VIEWPORTS)).toEqual([]);
  });

  it('rejette les scénarios invalides avant le navigateur (CL-3)', () => {
    const errors = validateScenarios(
      [
        scenario({ screenId: 'écran' }),
        scenario({ state: 'État' }),
        scenario({ source: 'index.html' }),
        scenario({ setup: undefined as unknown as Scenario['setup'] }),
        scenario({ state: 'autre' }),
        scenario({ state: 'autre' }),
      ],
      VIEWPORTS,
    );
    expect(errors.join('\n')).toContain('screenId invalide');
    expect(errors.join('\n')).toContain("nom d'état invalide");
    expect(errors.join('\n')).toContain('source invalide');
    expect(errors.join('\n')).toContain('setup et expect sont obligatoires');
    expect(errors.join('\n')).toContain('Nom de fichier en double : SCR-01-autre-desktop.png');
  });

  it('lit les dimensions IHDR et calcule le SHA-256', () => {
    expect(pngSize(PNG_1X1)).toEqual({ width: 1, height: 1 });
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(() => pngSize(Buffer.from('not a png'))).toThrow('PNG invalide');
    expect(() => pngSize(PNG_1X1.subarray(0, 12))).toThrow('PNG invalide');
  });

  it('construit une entrée de manifeste avec chemins relatifs et métadonnées (CA-3)', () => {
    const e = manifestEntry({
      screenId: 'SCR-01',
      state: 'base',
      viewport: 'desktop',
      source: 'Inscription.dc.html',
      png: PNG_1X1,
      viewportSize: { width: 1440, height: 900 },
    });
    expect(e).toEqual({
      screenId: 'SCR-01',
      state: 'base',
      viewport: 'desktop',
      viewportWidth: 1440,
      viewportHeight: 900,
      source: 'design/maquettes/Inscription.dc.html',
      file: 'design/references/SCR-01-base-desktop.png',
      width: 1,
      height: 1,
      fixedAt: '2026-11-11T12:20:00Z',
      locale: 'fr-FR',
      timeZone: 'Europe/Paris',
      zoom: 0.9,
      sha256: sha256(PNG_1X1),
    });
    expect(e.source.startsWith('/')).toBe(false);
    expect(e.file.startsWith('design/references/')).toBe(true);
  });

  it('refuse un zoom différent de 90 % (BR-NAV-06)', () => {
    expect(() =>
      manifestEntry({
        screenId: 'SCR-01',
        state: 'base',
        viewport: 'desktop',
        source: 'Inscription.dc.html',
        png: PNG_1X1,
        viewportSize: { width: 1440, height: 900 },
        zoom: 1,
      }),
    ).toThrow('Zoom 1 refusé');
  });

  it('trie par écran, état puis viewport et produit un JSON UTF-8 LF', () => {
    const list = [
      entry({ screenId: 'SCR-02', state: 'base', viewport: 'desktop' }),
      entry({ screenId: 'SCR-01', state: 'proposition', viewport: 'desktop' }),
      entry({ screenId: 'SCR-01', state: 'base', viewport: 'mobile' }),
      entry({ screenId: 'SCR-01', state: 'base', viewport: 'desktop' }),
    ];
    expect(sortEntries(list).map((e) => `${e.screenId}/${e.state}/${e.viewport}`)).toEqual([
      'SCR-01/base/desktop',
      'SCR-01/base/mobile',
      'SCR-01/proposition/desktop',
      'SCR-02/base/desktop',
    ]);
    const json = toJson(buildManifest(list));
    expect(json.endsWith('\n')).toBe(true);
    expect(json).not.toContain('\r');
    const parsed = JSON.parse(json) as { references: ReferenceEntry[] };
    expect(parsed.references).toHaveLength(4);
    expect(parsed.references[0]?.screenId).toBe('SCR-01');
  });

  it('extrait les jetons utiles avec leur provenance (CA-4)', () => {
    const raw: TokenEntry[] = [
      { screenId: 'SCR-01', source: 'design/maquettes/Inscription.dc.html', selector: 'body', property: 'color', value: 'rgb(17, 17, 19)' },
      { screenId: 'SCR-01', source: 'design/maquettes/Inscription.dc.html', selector: 'body', property: 'color', value: 'rgb(17, 17, 19)' },
      { screenId: 'SCR-01', source: 'design/maquettes/Inscription.dc.html', selector: 'body', property: 'padding', value: '0px' },
      { screenId: 'SCR-01', source: 'design/maquettes/Inscription.dc.html', selector: 'body', property: 'border-radius', value: 'normal' },
      { screenId: 'SCR-01', source: 'design/maquettes/Inscription.dc.html', selector: 'h1', property: 'font-family', value: '"Space Grotesk", sans-serif' },
      { screenId: 'SCR-02', source: 'design/maquettes/Inscription.dc.html', selector: 'h1', property: 'font-size', value: '32px' },
    ];
    const entries = tokenEntries(raw);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => `${e.screenId}/${e.selector}/${e.property}`)).toEqual([
      'SCR-01/body/color',
      'SCR-01/h1/font-family',
      'SCR-02/h1/font-size',
    ]);
    for (const e of entries) {
      expect(e.value).not.toBe('');
      expect(e.source).toBe('design/maquettes/Inscription.dc.html');
      expect(e.selector).toBeTruthy();
      expect(e.property).toBeTruthy();
    }
    const tokens = buildTokens(entries);
    expect(tokens.rule).toBe('BR-NAV-06');
    expect(tokens.zoom).toBe(0.9);
    expect(tokens.note).toContain('zoom de 90 %');
    expect(tokens.distinct.color).toEqual(['rgb(17, 17, 19)']);
    expect(tokens.distinct['font-size']).toEqual(['32px']);
  });
});
