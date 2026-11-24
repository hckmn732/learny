// Licences des bibliothèques et des polices embarquées (SPEC-3502 EF-6).
//
// Le fichier `store/licenses.json` est **généré** par `scripts/generate-licenses.mjs` (et par
// `node --experimental-strip-types`) : ce module porte la règle, le script l'écrit, le test
// `store/metadata.test.ts` refuse un fichier périmé. L'écran Profil → À propos affiche ce fichier ;
// aucune licence n'est donc recopiée à la main dans un écran ni dans un texte de store.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.dirname(HERE);

/** Licence des polices embarquées (`assets/fonts/`, SIL Open Font License 1.1). */
export const FONT_LICENSE = 'SIL Open Font License 1.1';

/** Une entrée de licence : nom lisible, version, licence SPDX, et l'origine du texte. */
export interface LicenseEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
}

/** Licence des paquets de l'espace de travail : le dépôt lui-même, sans texte tiers. */
const WORKSPACE_LICENSE = 'Interne (paquet de l’espace de travail Learny)';

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/** Version d'un paquet installé, ou `null` s'il n'est pas présent dans `node_modules`. */
function installedVersion(appDir: string, name: string): string | null {
  const file = path.join(appDir, 'node_modules', name, 'package.json');
  if (!fs.existsSync(file)) return null;
  const pkg = readJson(file);
  return typeof pkg.version === 'string' ? pkg.version : null;
}

/** Licence déclarée par un paquet installé (`license`, sinon la première de `licenses`). */
function installedLicense(appDir: string, name: string): string {
  const file = path.join(appDir, 'node_modules', name, 'package.json');
  if (!fs.existsSync(file)) return 'MIT';
  const pkg = readJson(file);
  if (typeof pkg.license === 'string') return pkg.license;
  const list = pkg.licenses;
  if (Array.isArray(list)) {
    const first = list[0] as { type?: unknown } | undefined;
    if (typeof first?.type === 'string') return first.type;
  }
  return 'MIT';
}

/**
 * Construit la liste triée des licences : dépendances directes de `apps/mobile` (les paquets
 * `@learny/*` sont les nôtres) puis polices de `assets/fonts`.
 */
export function buildLicenses(appDir: string = APP_DIR): {
  readonly generator: string;
  readonly fonts: readonly LicenseEntry[];
  readonly packages: readonly LicenseEntry[];
} {
  const pkg = readJson(path.join(appDir, 'package.json'));
  const dependencies = { ...(pkg.dependencies as Record<string, string> | undefined) };
  const packages: LicenseEntry[] = [];
  for (const name of Object.keys(dependencies).sort()) {
    if (name.startsWith('@learny/')) {
      packages.push({ name, version: 'workspace', license: WORKSPACE_LICENSE });
      continue;
    }
    const version = installedVersion(appDir, name);
    packages.push({
      name,
      version: version ?? 'non installé',
      license: installedLicense(appDir, name),
    });
  }

  const fontsDir = path.join(appDir, 'assets', 'fonts');
  const fontFiles = fs.existsSync(fontsDir)
    ? fs.readdirSync(fontsDir).filter((file) => /\.(ttf|otf)$/i.test(file)).sort()
    : [];
  const families = new Map<string, string[]>();
  for (const file of fontFiles) {
    const family = file.split('-')[0] ?? file;
    families.set(family, [...(families.get(family) ?? []), file]);
  }
  const fonts: LicenseEntry[] = [...families.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([family, files]) => ({
      name: family,
      version: files.map((file) => file.replace(/\.(ttf|otf)$/i, '')).join(', '),
      license: FONT_LICENSE,
    }));

  return {
    generator: 'node --experimental-strip-types apps/mobile/store/licenses.ts',
    fonts,
    packages,
  };
}

/** Sérialisation stable du fichier versionné (deux espaces, saut de ligne final). */
export function serializeLicenses(appDir: string = APP_DIR): string {
  return `${JSON.stringify(buildLicenses(appDir), null, 2)}\n`;
}
