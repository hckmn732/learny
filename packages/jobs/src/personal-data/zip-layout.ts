// Pure layout of the personal-data ZIP (SPEC-211 EF-3, CL-10, ADR-0216).
//
// Every name in the archive is built here, never by string concatenation at the call site: path
// separators, traversal segments and control characters are neutralised, collisions inside one
// directory are suffixed `-2`, `-3`…, and the order of the entries is deterministic so that the
// demonstration, the tests and the evidence listing always agree.
export const ARCHIVE_README = 'README.txt';
export const ARCHIVE_SETTINGS = 'settings.json';
export const ARCHIVE_RESULTS = 'results.json';
export const ARCHIVE_CONVERSATIONS = 'conversations.json';

// eslint-disable-next-line no-control-regex -- explicit removal of control characters (CL-10)
const CONTROL = /[\u0000-\u001f\u007f]/g;
const DIACRITICS = /[\u0300-\u036f]/g;

function clean(value: string): string {
  return value.normalize('NFKD').replace(DIACRITICS, '');
}

/** Strips every dangerous character from an original file name (CL-10). */
export function normalizeArchiveName(originalName: string, fallback = 'fichier'): string {
  const source = clean(originalName.normalize('NFC')).replace(CONTROL, '').trim();
  const replaced = source
    .replace(/[\\/]+/g, '-')
    .replace(/\.{2,}/g, '')
    .replace(/[<>:"|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\s-]+|[.\s-]+$/g, '');
  return replaced === '' ? fallback : replaced.slice(0, 120);
}

/** Lower-case archive slug: `SAP S/4HANA — Finance` → `sap-s-4hana-finance`. */
export function archiveSlug(value: string, fallback = 'sans-titre'): string {
  const slug = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug === '' ? fallback : slug;
}

/** Module folder `NN-<slug>` (two-digit position, stable across exports). */
export function moduleFolder(position: number, title: string): string {
  const bounded = Number.isInteger(position) && position > 0 ? position : 1;
  return `${String(bounded).padStart(2, '0')}-${archiveSlug(title, 'module')}`;
}

function withSuffix(name: string, suffix: number): string {
  const slash = name.lastIndexOf('/');
  const folder = slash === -1 ? '' : name.slice(0, slash + 1);
  const file = slash === -1 ? name : name.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return `${folder}${file}-${String(suffix)}`;
  return `${folder}${file.slice(0, dot)}-${String(suffix)}${file.slice(dot)}`;
}

/** Reserves one full path, suffixing the file name when the directory already holds it. */
export function reserveEntryName(used: Set<string>, wanted: string): string {
  let candidate = wanted;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = withSuffix(wanted, suffix);
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Reserves one folder name inside a parent, suffixing `-2`, `-3` on a collision. */
export function reserveFolderName(used: Set<string>, wanted: string): string {
  let candidate = wanted;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${wanted}-${String(suffix)}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export interface ArchiveApport {
  /** Original file name; neutralised by `normalizeArchiveName`. */
  name: string;
  /** Storage path read by the zip step; mutually exclusive with `text`. */
  storagePath?: string | null;
  /** Inline text (a note that never had a blob). */
  text?: string | null;
}

export interface ArchiveModule {
  position: number;
  title: string;
  /** Rendered course of the module, or `null` when no course version exists. */
  courseMarkdown?: string | null;
  apports: ArchiveApport[];
}

export interface ArchiveFormation {
  title: string;
  programme: unknown;
  modules: ArchiveModule[];
}

export interface ArchiveModel {
  readme: string;
  settings: unknown;
  results: unknown;
  conversations: unknown;
  formations: ArchiveFormation[];
}

export interface ArchiveEntry {
  name: string;
  text?: string;
  storagePath?: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Deterministic list of the archive entries of one learner (EF-3). */
export function buildArchiveEntries(model: ArchiveModel): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [
    { name: ARCHIVE_README, text: model.readme },
    { name: ARCHIVE_SETTINGS, text: json(model.settings) },
    { name: ARCHIVE_RESULTS, text: json(model.results) },
    { name: ARCHIVE_CONVERSATIONS, text: json(model.conversations) },
  ];
  const usedFormationSlugs = new Set<string>();
  const used = new Set(entries.map((entry) => entry.name));

  for (const formation of model.formations) {
    const formationSlug = reserveFolderName(
      usedFormationSlugs,
      archiveSlug(formation.title, 'formation'),
    );
    const formationFolder = `formations/${formationSlug}`;
    const programmeEntry = reserveEntryName(used, `${formationFolder}/programme.json`);
    entries.push({ name: programmeEntry, text: json(formation.programme) });

    const usedModuleFolders = new Set<string>();
    for (const module of formation.modules) {
      const folder = reserveFolderName(
        usedModuleFolders,
        moduleFolder(module.position, module.title),
      );
      if (typeof module.courseMarkdown === 'string' && module.courseMarkdown !== '') {
        const courseEntry = reserveEntryName(used, `${formationFolder}/${folder}/cours.md`);
        entries.push({ name: courseEntry, text: module.courseMarkdown });
      }

      const apportFolder = `apports/${formationSlug}/${folder}`;
      for (const apport of module.apports) {
        const name = normalizeArchiveName(apport.name, 'apport');
        const target = reserveEntryName(used, `${apportFolder}/${name}`);
        if (typeof apport.text === 'string') entries.push({ name: target, text: apport.text });
        else if (typeof apport.storagePath === 'string' && apport.storagePath !== '') {
          entries.push({ name: target, storagePath: apport.storagePath });
        }
      }
    }
  }
  return entries;
}

const SIZE_UNITS = ['o', 'Ko', 'Mo', 'Go'] as const;

/** French size label of BR-ACC-10: `12,4 Mo`, `1 Ko`, `980 o`. */
export function formatSizeLabel(bytes: number): string {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  let unit = 0;
  let amount = value;
  while (amount >= 1000 && unit < SIZE_UNITS.length - 1) {
    amount /= 1000;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(amount) : Math.round(amount * 10) / 10;
  const text = String(rounded).replace('.', ',');
  return `${text} ${SIZE_UNITS[unit] ?? 'o'}`;
}

/** `mercredi 18 novembre à 13:20`, in the learner's zone. */
export function formatLongDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')} à ${part('hour')}:${part('minute')}`;
}

export interface SettingsInput {
  profile: Record<string, unknown>;
  studyPreferences: Record<string, unknown> | null;
  notificationSettings: Record<string, unknown> | null;
  automations: Record<string, unknown>[];
}

const SECRET_KEYS = new Set([
  'encryptedKey',
  'encrypted_key',
  'apiKey',
  'api_key',
  'keyLast4',
  'key_last4',
  'secret',
  'password',
  'token',
]);

function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => withoutSecrets(item));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEYS.has(key))
      .map(([key, item]) => [key, withoutSecrets(item)]),
  );
}

/** `settings.json` of EF-3: profile, rhythm, notifications and automations, never a secret. */
export function buildSettingsJson(input: SettingsInput): Record<string, unknown> {
  return {
    profile: withoutSecrets(input.profile),
    studyPreferences: withoutSecrets(input.studyPreferences),
    notificationSettings: withoutSecrets(input.notificationSettings),
    automations: withoutSecrets(input.automations),
  };
}
