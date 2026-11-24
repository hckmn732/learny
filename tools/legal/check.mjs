#!/usr/bin/env node
// Contrôle des documents légaux (SPEC-806 ET-6, CA-4).
//
// Compare les versions de configuration, des gabarits et des tests, signale les placeholders
// d'identité en prépublication et les liens cassés. Aucune acceptation factice n'est écrite et
// aucune valeur d'identité n'est inventée : seuls les noms des champs manquants sont affichés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const IDENTITY_KEYS = [
  'LEGAL_ENTITY_NAME',
  'LEGAL_ENTITY_ADDRESS',
  'LEGAL_CONTACT_EMAIL',
  'LEGAL_HOST_NAME',
];

export const DOCUMENT_VERSIONS = {
  'cgu.md': 'LEGAL_CGU_VERSION',
  'confidentialite.md': 'LEGAL_PRIVACY_VERSION',
  'mentions.md': 'LEGAL_CGU_VERSION',
};

export const KNOWN_LINKS = [
  '/legal/cgu',
  '/legal/confidentialite',
  '/legal/mentions',
  '/accessibilite',
];

const REQUIRED_FILES = [
  'cgu.md',
  'confidentialite.md',
  'mentions.md',
  'registre-traitements.md',
  'sous-traitants.md',
];

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

/** Defaults of `packages/config/src/product.ts`, read as text so the script stays dependency-free. */
export function configDefaults(root = REPO) {
  const source = read(root, 'packages/config/src/product.ts');
  const match = /LEGAL_VERSIONS\s*=\s*\{\s*cgu:\s*'([^']+)'\s*,\s*privacy:\s*'([^']+)'\s*\}/.exec(
    source,
  );
  if (match === null) return null;
  return { cgu: match[1], privacy: match[2] };
}

const IDENTITY_FIELDS = {
  LEGAL_ENTITY_NAME: 'entityName',
  LEGAL_ENTITY_ADDRESS: 'entityAddress',
  LEGAL_CONTACT_EMAIL: 'contactEmail',
  LEGAL_HOST_NAME: 'hostName',
};

/**
 * Identity of `LEGAL_IDENTITY` in `packages/config/src/product.ts` (ADR-4007), keyed by template
 * marker. A field still set to `LEGAL_PLACEHOLDER` is left out: it is reported as missing.
 */
export function configIdentity(root = REPO) {
  const source = read(root, 'packages/config/src/product.ts');
  const block = /LEGAL_IDENTITY\s*=\s*\{([^}]*)\}/.exec(source);
  const identity = {};
  if (block === null) return identity;
  for (const [key, field] of Object.entries(IDENTITY_FIELDS)) {
    const match = new RegExp(`${field}:\\s*'([^']*)'`).exec(block[1]);
    if (match !== null && match[1].trim() !== '') identity[key] = match[1];
  }
  return identity;
}

export function activeVersions(
  env = process.env,
  defaults = { cgu: '2026-11-11', privacy: '2026-11-11' },
) {
  const cgu = typeof env.LEGAL_CGU_VERSION === 'string' ? env.LEGAL_CGU_VERSION.trim() : '';
  const privacy =
    typeof env.LEGAL_PRIVACY_VERSION === 'string' ? env.LEGAL_PRIVACY_VERSION.trim() : '';
  return { cgu: cgu || defaults.cgu || '', privacy: privacy || defaults.privacy || '' };
}

function parseMetadata(text) {
  const meta = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^<!--\s*legal-(document|version|effective):\s*(.+?)\s*-->\s*$/.exec(line);
    if (match !== null) meta[match[1]] = match[2];
  }
  return meta;
}

function checkDocuments(root, env, errors) {
  const defaults = configDefaults(root);
  if (defaults === null) errors.push('versions de configuration introuvables dans product.ts');
  const versions = activeVersions(env, defaults ?? undefined);
  if (versions.cgu === '') errors.push('LEGAL_CGU_VERSION vide dans la configuration');
  if (versions.privacy === '') errors.push('LEGAL_PRIVACY_VERSION vide dans la configuration');

  for (const file of REQUIRED_FILES) {
    const relative = `docs/legal/${file}`;
    if (!exists(root, relative)) {
      errors.push(`${relative} : fichier absent`);
      continue;
    }
    const text = read(root, relative);
    if (file in DOCUMENT_VERSIONS) {
      const meta = parseMetadata(text);
      if (meta.document === undefined)
        errors.push(`${relative} : métadonnée legal-document absente`);
      if (meta.version === undefined) errors.push(`${relative} : métadonnée legal-version absente`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.effective ?? '')) {
        errors.push(`${relative} : date de prise d'effet invalide`);
      }
      const expected = DOCUMENT_VERSIONS[file];
      if (!text.includes(`{{${expected}}}`)) {
        errors.push(`${relative} : variable de version {{${expected}}} absente`);
      }
      // A literal version that differs from the configuration is a drift: versions come from env.
      const literal = [...text.matchAll(/Version\s+(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
      const active = expected === 'LEGAL_PRIVACY_VERSION' ? versions.privacy : versions.cgu;
      for (const value of literal) {
        if (value !== active) {
          errors.push(`${relative} : version littérale ${value} discordante (attendu ${active})`);
        }
      }
    }

    for (const marker of text.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
      const key = marker[1];
      if (![...IDENTITY_KEYS, 'LEGAL_CGU_VERSION', 'LEGAL_PRIVACY_VERSION'].includes(key)) {
        errors.push(`${relative} : variable inconnue {{${key}}}`);
      }
    }

    for (const link of text.matchAll(/\]\((\/[^)\s#?]*)/g)) {
      const href = link[1].replace(/\/$/, '') || '/';
      if (!KNOWN_LINKS.includes(href) && href !== '/') {
        errors.push(`${relative} : lien cassé ${link[1]}`);
      }
    }
  }
  return versions;
}

function checkFooter(root, errors) {
  const relative = 'apps/web/lib/site-footer-links.ts';
  if (!exists(root, relative)) {
    errors.push(`${relative} : registre de pied de page absent`);
    return;
  }
  const source = read(root, relative);
  const hrefs = [...source.matchAll(/href:\s*'([^']+)'/g)].map((match) => match[1]);
  if (hrefs.join(',') !== KNOWN_LINKS.join(',')) {
    errors.push(`ordre du pied de page inattendu : ${hrefs.join(', ') || 'aucun lien'}`);
  }
  for (const href of KNOWN_LINKS) {
    const page =
      href === '/accessibilite'
        ? 'apps/web/app/accessibilite/page.tsx'
        : `apps/web/app${href}/page.tsx`;
    if (!exists(root, page)) errors.push(`lien ${href} : page ${page} absente`);
  }
}

function checkTests(root, errors) {
  const configTest = 'packages/config/src/legal.test.ts';
  const acceptTest = 'packages/services/src/legal/accept.test.ts';
  for (const relative of [configTest, acceptTest]) {
    if (!exists(root, relative)) errors.push(`${relative} : test de version absent`);
  }
  if (exists(root, configTest)) {
    const source = read(root, configTest);
    if (!source.includes('LEGAL_VERSIONS')) {
      errors.push(`${configTest} : les versions actives ne sont pas comparées`);
    }
  }
}

/**
 * Runs every control without writing anything. `env.APP_ENV=production|preview` requires the four
 * identity values; locally their absence is a warning, never an invented value.
 */
export function checkLegal(options = {}) {
  const root = options.root ?? REPO;
  // The identity and the versions are code constants (ADR-4007); `env` only injects them in tests.
  const env = options.env ?? { APP_ENV: process.env.APP_ENV, ...configIdentity(root) };
  const errors = [];
  const warnings = [];
  const versions = checkDocuments(root, env, errors);
  checkFooter(root, errors);
  checkTests(root, errors);

  const missingIdentity = IDENTITY_KEYS.filter((key) => {
    const value = env[key];
    return typeof value !== 'string' || value.trim() === '';
  });
  const appEnv = typeof env.APP_ENV === 'string' ? env.APP_ENV : 'local';
  const prePublication = appEnv === 'production' || appEnv === 'preview';
  if (missingIdentity.length > 0) {
    const message = `identité légale manquante : ${missingIdentity.join(', ')}`;
    if (prePublication) errors.push(message);
    else warnings.push(message);
  }

  return { ok: errors.length === 0, errors, warnings, missingIdentity, versions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = checkLegal();
  for (const warning of report.warnings) console.warn(`⚠ ${warning}`);
  if (!report.ok) {
    console.error(report.errors.map((error) => `✖ ${error}`).join('\n'));
    console.error(
      `\nLes identités absentes sont des noms de champs : aucune valeur n'est inventée.`,
    );
    process.exit(1);
  }
  console.log(
    `✔ documents légaux cohérents (CGU ${report.versions.cgu}, confidentialité ${report.versions.privacy}).`,
  );
}
