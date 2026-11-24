import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REPO, checkLegal, configIdentity } from '../../check.mjs';

const COMPLETE_IDENTITY = {
  LEGAL_ENTITY_NAME: 'Learny Éditions SAS',
  LEGAL_ENTITY_ADDRESS: '12 rue des Écoles, 75005 Paris',
  LEGAL_CONTACT_EMAIL: 'bonjour@learny.test',
  LEGAL_HOST_NAME: 'Supabase et Vercel',
};

let root: string;

function write(relative: string, content: string): void {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'learny-legal-'));
  fs.mkdirSync(path.join(root, 'docs', 'legal'), { recursive: true });
  fs.cpSync(path.join(REPO, 'docs', 'legal'), path.join(root, 'docs', 'legal'), {
    recursive: true,
  });
  write(
    'packages/config/src/product.ts',
    "export const LEGAL_VERSIONS = { cgu: '2026-11-11', privacy: '2026-11-11' } as const;\n",
  );
  write(
    'packages/config/src/legal.test.ts',
    "import { LEGAL_VERSIONS } from './product';\nvoid LEGAL_VERSIONS;\n",
  );
  write('packages/services/src/legal/accept.test.ts', "describe('[SPEC-806]', () => {});\n");
  write(
    'apps/web/lib/site-footer-links.ts',
    [
      'export const SITE_FOOTER_LINKS = [',
      "  { href: '/legal/cgu', label: 'CGU' },",
      "  { href: '/legal/confidentialite', label: 'Confidentialité' },",
      "  { href: '/legal/mentions', label: 'Mentions légales' },",
      "  { href: '/accessibilite', label: 'Accessibilité' },",
      '];',
    ].join('\n'),
  );
  for (const relative of [
    'apps/web/app/legal/cgu/page.tsx',
    'apps/web/app/legal/confidentialite/page.tsx',
    'apps/web/app/legal/mentions/page.tsx',
    'apps/web/app/accessibilite/page.tsx',
  ]) {
    write(relative, 'export default function Page() { return null; }\n');
  }
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('[SPEC-806] legal:check', () => {
  it('CA-4 — les gabarits locaux sont cohérents et une identité absente reste un avertissement', () => {
    const report = checkLegal({ root, env: {} });
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.missingIdentity).toEqual([
      'LEGAL_ENTITY_NAME',
      'LEGAL_ENTITY_ADDRESS',
      'LEGAL_CONTACT_EMAIL',
      'LEGAL_HOST_NAME',
    ]);
    expect(report.warnings).toEqual([
      'identité légale manquante : LEGAL_ENTITY_NAME, LEGAL_ENTITY_ADDRESS, LEGAL_CONTACT_EMAIL, LEGAL_HOST_NAME',
    ]);
  });

  it('CA-4 — en prépublication, une identité absente est une erreur nommée sans valeur inventée', () => {
    const report = checkLegal({
      root,
      env: { APP_ENV: 'production', ...COMPLETE_IDENTITY, LEGAL_HOST_NAME: '' },
    });
    expect(report.ok).toBe(false);
    expect(report.errors.join('\n')).toContain('identité légale manquante : LEGAL_HOST_NAME');
    expect(report.errors.join('\n')).not.toContain('Learny Éditions');
  });

  it('CA-4 — un lien cassé, une version discordante et une variable inconnue sont détectés', () => {
    const file = path.join(root, 'docs/legal/cgu.md');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace('Version {{LEGAL_CGU_VERSION}}', 'Version 2024-01-01 {{LEGAL_INCONNUE}}')
        .replace(
          '## Objet et acceptation {#objet}',
          '## Objet et acceptation {#objet}\n\n[Lien](/legal/inexistant)',
        ),
    );
    const report = checkLegal({ root, env: COMPLETE_IDENTITY });
    const text = report.errors.join('\n');
    expect(text).toContain('version littérale 2024-01-01 discordante');
    expect(text).toContain('variable inconnue {{LEGAL_INCONNUE}}');
    expect(text).toContain('lien cassé /legal/inexistant');
    expect(report.ok).toBe(false);
  });

  it('ADR-4007 — l’identité est lue dans la constante LEGAL_IDENTITY du code', () => {
    write(
      'packages/config/src/product.ts',
      [
        "export const LEGAL_VERSIONS = { cgu: '2026-11-11', privacy: '2026-11-11' } as const;",
        'export const LEGAL_IDENTITY = {',
        "  entityName: 'Learny Éditions SAS',",
        '  entityAddress: LEGAL_PLACEHOLDER,',
        "  contactEmail: 'bonjour@learny.test',",
        '  hostName: LEGAL_PLACEHOLDER,',
        '} as const;',
      ].join('\n'),
    );
    expect(configIdentity(root)).toEqual({
      LEGAL_ENTITY_NAME: 'Learny Éditions SAS',
      LEGAL_CONTACT_EMAIL: 'bonjour@learny.test',
    });
  });

  it('CA-4 — l’ordre du pied de page et la présence des pages sont contrôlés', () => {
    const footer = path.join(root, 'apps/web/lib/site-footer-links.ts');
    fs.writeFileSync(
      footer,
      fs.readFileSync(footer, 'utf8').replace("'/legal/cgu'", "'/legal/mentions'"),
    );
    fs.rmSync(path.join(root, 'apps/web/app/accessibilite/page.tsx'));
    const report = checkLegal({ root, env: COMPLETE_IDENTITY });
    expect(report.ok).toBe(false);
    expect(report.errors.join('\n')).toContain('ordre du pied de page inattendu');
    expect(report.errors.join('\n')).toContain('page apps/web/app/accessibilite/page.tsx absente');
  });
});
