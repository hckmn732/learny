// Canonical legal documents (SPEC-806 EF-1, EF-2, ET-2; ADR-0045, ADR-0204).
//
// The Markdown templates stay in `docs/legal/` and are read on the server: identity values are
// substituted from the validated configuration, and an absent value keeps the exact
// « [à compléter] » marker. Every section carries an explicit stable anchor (`{#slug}`) so the
// table of contents and deep links work without JavaScript; no URL parameter enters the document.
import fs from 'node:fs';
import path from 'node:path';

import { legalConfigFromEnv, type LegalConfig } from '@learny/config';

import { findRepoRoot } from '../sdd-status';

export const LEGAL_PAGE_KEYS = ['cgu', 'confidentialite', 'mentions'] as const;
export type LegalPageKey = (typeof LEGAL_PAGE_KEYS)[number];

export const LEGAL_DOCUMENT_FILES: Readonly<Record<LegalPageKey, string>> = {
  cgu: 'cgu.md',
  confidentialite: 'confidentialite.md',
  mentions: 'mentions.md',
};

export interface LegalSection {
  /** Stable fragment, used by the table of contents and deep links. */
  id: string;
  title: string;
  markdown: string;
}

export interface LegalDocumentView {
  key: LegalPageKey;
  title: string;
  version: string;
  effectiveDate: string;
  /** Raw template before substitution, kept for diagnostics and tests. */
  template: string;
  markdown: string;
  sections: LegalSection[];
  /** True when at least one identity value is the placeholder. */
  incomplete: boolean;
}

const SECTION_RE = /^##\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?\s*$/;
const META_RE = /^<!--\s*legal-(document|version|effective):\s*(.+?)\s*-->\s*$/;

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatEffectiveDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** Substitutes the four identity variables and the two versions, leaving unknown markers intact. */
export function substituteLegalVariables(template: string, config: LegalConfig): string {
  const values: Record<string, string> = {
    LEGAL_ENTITY_NAME: config.identity.entityName,
    LEGAL_ENTITY_ADDRESS: config.identity.entityAddress,
    LEGAL_CONTACT_EMAIL: config.identity.contactEmail,
    LEGAL_HOST_NAME: config.identity.hostName,
    LEGAL_CGU_VERSION: config.versions.cgu,
    LEGAL_PRIVACY_VERSION: config.versions.privacy,
  };
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (marker, key: string) => values[key] ?? marker);
}

/** Parses one versioned template into metadata and anchored sections. */
export function parseLegalDocument(
  key: LegalPageKey,
  template: string,
  config: LegalConfig = legalConfigFromEnv(),
): LegalDocumentView {
  const meta: Record<string, string> = {};
  const contentLines: string[] = [];
  for (const line of template.split(/\r?\n/)) {
    const match = META_RE.exec(line);
    if (match !== null) {
      meta[match[1] ?? ''] = match[2] ?? '';
      continue;
    }
    contentLines.push(line);
  }
  const rendered = substituteLegalVariables(contentLines.join('\n'), config);

  const lines = rendered.split(/\r?\n/);
  const headings: { index: number; title: string; id: string }[] = [];
  let title = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (title === '' && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    const match = SECTION_RE.exec(line);
    if (match !== null) {
      const value = match[1]?.trim() ?? '';
      headings.push({ index, title: value, id: match[2] ?? slugify(value) });
    }
  }

  const sections: LegalSection[] = headings.map((heading, index) => {
    const end = headings[index + 1]?.index ?? lines.length;
    return {
      id: heading.id,
      title: heading.title,
      markdown: lines
        .slice(heading.index + 1, end)
        .join('\n')
        .trim(),
    };
  });

  const version = substituteLegalVariables(meta.version ?? '', config) || config.versions.cgu;
  const effectiveRaw = substituteLegalVariables(meta.effective ?? '', config);

  return {
    key,
    title: title || key,
    version,
    effectiveDate: formatEffectiveDate(effectiveRaw),
    template,
    markdown: rendered,
    sections,
    incomplete: config.missingIdentity.length > 0,
  };
}

const CACHE = new Map<LegalPageKey, string>();

function readTemplate(key: LegalPageKey, root?: string): string {
  const cached = CACHE.get(key);
  if (root === undefined && cached !== undefined) return cached;
  const repo = root ?? findRepoRoot();
  if (repo === null) throw new Error('Racine du dépôt introuvable pour les documents légaux.');
  const file = path.join(repo, 'docs', 'legal', LEGAL_DOCUMENT_FILES[key]);
  const template = fs.readFileSync(file, 'utf8');
  if (root === undefined) CACHE.set(key, template);
  return template;
}

/** Loads and parses one public legal page; `root` and `config` are injectable for tests. */
export function loadLegalDocument(
  key: LegalPageKey,
  options: { root?: string; config?: LegalConfig } = {},
): LegalDocumentView {
  const template = readTemplate(key, options.root);
  return parseLegalDocument(key, template, options.config ?? legalConfigFromEnv());
}
