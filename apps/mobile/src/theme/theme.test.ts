// Vitest — SPEC-3002 EF-1/EF-2, ET-2, CA-2. The pure part of the theme: brand colours against the
// design references, WCAG contrasts and the native scales. React Native is never imported here.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fontSizesPx } from '@learny/ui/tokens';

import { contrastReport, failingPairs, TEXT_PAIRS } from './contrast';
import { colors, minTouchTarget, radii, spacing, typeScale } from './tokens';

const ROOT = process.cwd();

function readText(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

/** `#F4F4F1` → `rgb(244, 244, 241)`, the form the design reference dumps. */
function rgbOf(hex: string): string {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16));
  return `rgb(${channels.join(', ')})`;
}

describe('[SPEC-3002] thème — jetons', () => {
  const reference = readText('design/references/tokens.json');
  const mockup = readText('design/app-mobile/assets/app.css');

  it('garde les couleurs de marque du référence de jetons (ET-2)', () => {
    // The dump of `design/references/tokens.json` lists every computed colour of the web mockups.
    const inReference = {
      canvas: colors.canvas,
      surface: colors.surface,
      surfaceSubtle: colors.surfaceSubtle,
      ink: colors.ink,
      border: colors.border,
      inkMuted: colors.inkMuted,
      indigoInk: colors.indigoInk,
    } as const;
    for (const [name, hex] of Object.entries(inReference)) {
      expect(
        reference,
        `${name} (${hex}) doit figurer dans design/references/tokens.json`,
      ).toContain(rgbOf(hex));
    }
  });

  it('garde les couleurs de la maquette mobile (design/app-mobile/assets/app.css)', () => {
    // The mobile mockup carries the five brand colours of the track, absent from the web dump.
    const custom = (name: string): string => {
      const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(mockup);
      expect(match, `--${name} absent de la maquette mobile`).not.toBeNull();
      return (match?.[1] ?? '').toLowerCase();
    };
    expect(colors.canvas.toLowerCase()).toBe(custom('cream'));
    expect(colors.ink.toLowerCase()).toBe(custom('ink'));
    expect(colors.lime.toLowerCase()).toBe(custom('lime'));
    expect(colors.indigo.toLowerCase()).toBe(custom('indigo'));
    expect(colors.orange.toLowerCase()).toBe(custom('orange'));
    expect(colors.green.toLowerCase()).toBe(custom('green'));
    // `--lime-ink` of the mobile mockup (#3D5200) differs from the token (#3F5A00): the token
    // wins (ADR > maquette) and the gap is imperceptible; every other brand value is identical.
    expect(colors.limeInk.toLowerCase()).toBe('#3f5a00');
    expect(colors.indigoSoft.toLowerCase()).toBe(custom('indigo-pale'));
    expect(colors.orangeSoft.toLowerCase()).toBe(custom('orange-pale'));
    expect(colors.greenSoft.toLowerCase()).toBe(custom('green-pale'));
  });

  it('dérive les espacements et les rayons des échelles de @learny/ui/tokens', async () => {
    const tokens = await import('@learny/ui/tokens');
    for (const value of Object.values(spacing)) {
      expect(tokens.spacingPx).toContain(value);
    }
    const radiusValues = [
      radii.card,
      radii.option,
      radii.control,
      radii.sheet.ios,
      radii.sheet.android,
      radii.chip.android,
      radii.stat.ios,
      radii.stat.android,
      radii.list.ios,
      radii.list.android,
      radii.iconButton.ios,
      radii.badge,
    ];
    for (const value of radiusValues) {
      expect(tokens.radiiPx).toContain(value);
    }
    // The pill is the `rounded-full` of the design system.
    expect(radii.pill).toBe(999);
    expect(radii.chip.ios).toBe(999);
  });

  it('reprend l’échelle typographique native (34 pt iOS, 31 sp Android)', () => {
    expect(typeScale.ios.largeTitle.fontSize).toBe(34);
    expect(typeScale.android.largeTitle.fontSize).toBe(31);
    expect(typeScale.ios.sectionTitle.fontSize).toBe(20);
    expect(typeScale.android.sectionTitle.fontSize).toBe(20);
    expect(typeScale.ios.body.fontSize).toBe(16);
    expect(typeScale.android.body.fontSize).toBe(16);
    expect(typeScale.ios.label.fontSize).toBe(12);
    expect(typeScale.android.label.fontSize).toBe(11);
    expect(typeScale.android.label.textTransform).toBe('uppercase');
    // 34, 20, 16, 12 and 11 are published sizes of the design system.
    for (const size of [34, 20, 16, 12, 11]) {
      expect(fontSizesPx).toContain(size);
    }
  });

  it('impose 44 pt sur iOS et 48 dp sur Android (BR-PLA-02)', () => {
    expect(minTouchTarget.ios).toEqual({ width: 44, height: 44 });
    expect(minTouchTarget.android).toEqual({ width: 48, height: 48 });
  });
});

describe('[SPEC-3002] contrastes WCAG AA', () => {
  it('passe toutes les paires texte/fond du thème (CA-2)', () => {
    const report = contrastReport();
    expect(report.length).toBeGreaterThanOrEqual(20);
    for (const row of report) {
      expect(
        row.ratio,
        `${row.id} : ${row.foreground} sur ${row.background} = ${String(row.ratio)}:1 (minimum ${String(row.minimum)}:1)`,
      ).toBeGreaterThanOrEqual(row.minimum);
    }
    expect(failingPairs()).toEqual([]);
  });

  it('décrit chaque paire une seule fois', () => {
    const ids = TEXT_PAIRS.map((value) => value.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
