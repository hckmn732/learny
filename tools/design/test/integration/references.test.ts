import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { captureReferences } from '../../capture-references.mjs';
import { checkReferences } from '../../check-references.mjs';
import { REFERENCES_DIR, sourceFile } from '../../manifest.mjs';
import type { Manifest, Tokens } from '../../manifest.mjs';
import { SCENARIOS } from '../../scenarios.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MAQUETTES = path.join(ROOT, 'design', 'maquettes');
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-spec005-'));
const generationA = path.join(temp, 'a');
const generationB = path.join(temp, 'b');

afterAll(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});

function treeHash(dir: string): string {
  const hash = crypto.createHash('sha256');
  for (const name of fs.readdirSync(dir).sort()) {
    const file = path.join(dir, name);
    const stat = fs.statSync(file);
    hash.update(`${name}:${String(stat.size)}\n`);
    if (stat.isFile()) hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function readManifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
}

function referenceRoot(): string {
  const root = path.join(temp, 'check');
  fs.mkdirSync(path.join(root, 'design'), { recursive: true });
  fs.symlinkSync(MAQUETTES, path.join(root, 'design', 'maquettes'), 'dir');
  fs.cpSync(generationA, path.join(root, REFERENCES_DIR), { recursive: true });
  return root;
}

describe('[SPEC-005] references', () => {
  it(
    'génère deux fois des références identiques sans modifier les maquettes (CA-1, CA-2)',
    async () => {
      const before = treeHash(MAQUETTES);
      const first = await captureReferences({ outDir: generationA });
      const second = await captureReferences({ outDir: generationB });
      const after = treeHash(MAQUETTES);

      expect(after).toBe(before);
      expect(second).toEqual(first);
      expect(fs.readFileSync(path.join(generationA, 'manifest.json'), 'utf8')).toBe(
        fs.readFileSync(path.join(generationB, 'manifest.json'), 'utf8'),
      );

      const manifest = readManifest(generationA);
      expect(manifest.zoom).toBe(0.9);
      expect(manifest.references).toHaveLength(SCENARIOS.length * 2);
      for (const entry of manifest.references) {
        expect(entry.source).toMatch(/^design\/maquettes\/[^?#]+\.dc\.html(?:[?#].*)?$/);
        expect(entry.file).toMatch(/^design\/references\/.+\.png$/);
        expect(entry.fixedAt).toBe('2026-11-11T12:20:00Z');
        expect(entry.locale).toBe('fr-FR');
        expect(entry.timeZone).toBe('Europe/Paris');
        expect(entry.zoom).toBe(0.9);
        const a = fs.readFileSync(path.join(generationA, path.basename(entry.file)));
        const b = fs.readFileSync(path.join(generationB, path.basename(entry.file)));
        expect(a.equals(b), `${entry.file} identique`).toBe(true);
      }

      const sources = new Set(manifest.references.map((e) => sourceFile(e.source)));
      const bases = manifest.references.filter((e) => e.state === 'base');
      expect(sources.size).toBe(14);
      for (const source of sources) {
        const viewports = bases
          .filter((e) => sourceFile(e.source) === source)
          .map((e) => e.viewport);
        expect(viewports, `état de base de ${source}`).toEqual(['desktop', 'mobile']);
      }
      const states = new Set(manifest.references.map((e) => `${e.screenId}/${e.state}`));
      expect(states.size).toBe(SCENARIOS.length);
      expect(manifest.references.some((e) => e.screenId === 'SCR-05' && e.state === 'proposition')).toBe(true);
      expect(manifest.references.some((e) => e.screenId === 'SCR-16')).toBe(false);
    },
    600_000,
  );

  it(
    'détecte référence absente, dimension fausse et empreinte discordante (CA-3, CL-4)',
    () => {
      const root = referenceRoot();
      expect(checkReferences(root)).toEqual([]);

      const manifest = readManifest(path.join(root, REFERENCES_DIR));
      const victim = manifest.references[0];
      if (!victim) throw new Error('manifeste vide');
      const file = path.join(root, victim.file);
      const original = fs.readFileSync(file);

      fs.rmSync(file);
      expect(checkReferences(root).join('\n')).toContain(`${victim.file} : référence absente`);
      fs.writeFileSync(file, original);

      fs.writeFileSync(file, PNG_1X1);
      expect(checkReferences(root).join('\n')).toContain(`${victim.file} : dimensions 1×1`);
      fs.writeFileSync(file, original);

      const altered = Buffer.from(original);
      altered[60] = (altered[60] ?? 0) ^ 0xff;
      fs.writeFileSync(file, altered);
      expect(checkReferences(root).join('\n')).toContain(`${victim.file} : empreinte`);
      fs.writeFileSync(file, original);

      const extra = path.join(root, REFERENCES_DIR, 'SCR-99-factice-desktop.png');
      fs.writeFileSync(extra, PNG_1X1);
      expect(checkReferences(root).join('\n')).toContain('SCR-99-factice-desktop.png : PNG absent du manifeste');
      fs.rmSync(extra);

      expect(checkReferences(root)).toEqual([]);
    },
    120_000,
  );

  it('décrit les jetons observés avec sélecteur, propriété et provenance (CA-4)', () => {
    const tokens = JSON.parse(
      fs.readFileSync(path.join(generationA, 'tokens.json'), 'utf8'),
    ) as Tokens;
    expect(tokens.rule).toBe('BR-NAV-06');
    expect(tokens.zoom).toBe(0.9);
    expect(tokens.note).toContain('zoom de 90 %');
    expect(tokens.entries.length).toBeGreaterThan(50);
    for (const property of [
      'color',
      'font-family',
      'font-size',
      'border-radius',
      'padding',
      'gap',
    ]) {
      expect(Object.keys(tokens.distinct), property).toContain(property);
    }
    const screens = new Set(tokens.entries.map((e) => e.screenId));
    expect(screens.size).toBeGreaterThanOrEqual(14);
    for (const entry of tokens.entries) {
      expect(entry.source).toMatch(/^design\/maquettes\/.+\.dc\.html$/);
      expect(entry.selector).toBeTruthy();
      expect(entry.property).toBeTruthy();
      expect(entry.value).toBeTruthy();
    }
  });

  it(
    'échoue avec le nom du scénario et un diagnostic hors des références (CL-2)',
    async () => {
      const outDir = path.join(temp, 'failure');
      const diagnosticsDir = path.join(temp, 'diagnostics');
      await expect(
        captureReferences({
          outDir,
          diagnosticsDir,
          scenarios: [
            {
              screenId: 'SCR-01',
              state: 'etat-absent',
              source: 'Inscription.dc.html',
              setup: () => Promise.resolve(),
              expect: () => Promise.reject(new Error('état non atteint')),
            },
          ],
        }),
      ).rejects.toThrow('SCR-01/etat-absent/desktop');
      expect(fs.existsSync(path.join(outDir, 'manifest.json'))).toBe(false);
      const diagnostics = fs.readdirSync(diagnosticsDir);
      expect(diagnostics).toContain('SCR-01-etat-absent-desktop-echec.png');
      expect(path.resolve(diagnosticsDir).startsWith(path.resolve(ROOT, 'design', 'references'))).toBe(false);
    },
    120_000,
  );
});
