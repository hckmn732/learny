// Rapport de couplage de apps/web pour la piste de migration (SPEC-1001, EF-6 ; ADR-1003,
// ADR-1006). Aucune dépendance externe (ET-5) : Node.js ≥ 24 pur, l'analyse des imports se fait
// par expressions régulières sur `from '…'` et `import('…')`, jamais par exécution du code.
// Racine injectable : MIGRATION_ROOT est réservée aux tests (comme SDD_ROOT dans tools/sdd).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT = process.env.MIGRATION_ROOT
  ? path.resolve(process.env.MIGRATION_ROOT)
  : REPO_ROOT;

// Paquets serveur interdits dans apps/web (EF-4). @learny/core, @learny/contracts, @learny/config,
// @learny/testing et @learny/ui restent autorisés (ADR-1007).
export const SERVER_PACKAGES = [
  'db',
  'services',
  'jobs',
  'llm',
  'tutor',
  'ingestion',
  'automations',
  'notifications',
];

// `from '@learny/db/…'`, `} from "@learny/services"`, `import('@learny/llm/budget')`… Le nom du
// paquet doit être suivi d'un sous-chemin ou du délimiteur : `@learny/dbx` ne compte pas.
const IMPORT_RE = new RegExp(
  '(?:^|[^A-Za-z0-9_$])(?:from\\s+|import\\(\\s*)[\'"]@learny/(' +
    SERVER_PACKAGES.join('|') +
    ')(?:/[^\'"]*)?[\'"]',
);

export const WEB_CATEGORIES = ['pages', 'lib', 'components', 'dev', 'proxy', 'apiRoutes'];
const API_GLOB = 'apps/web/app/api/**';

/** Catégorie d'un fichier de apps/web (EF-6) ; `null` hors périmètre (test/, e2e/, scripts/…). */
export function categorizeWebFile(file) {
  if (file === 'apps/web/proxy.ts') return 'proxy';
  if (file.startsWith('apps/web/app/%5Fdev/')) return 'dev';
  if (file.startsWith('apps/web/app/api/')) return 'apiRoutes';
  if (file.startsWith('apps/web/app/')) return 'pages';
  if (file.startsWith('apps/web/lib/')) return 'lib';
  if (file.startsWith('apps/web/components/')) return 'components';
  return null;
}

/** Vrai si le texte importe un paquet serveur, statiquement ou dynamiquement (ET-5). */
export function importsServerPackage(text) {
  return IMPORT_RE.test(text);
}

function listWebFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(path.join(root, 'apps', 'web'));
  return out
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => path.relative(root, file).split(path.sep).join('/'))
    .sort();
}

/**
 * Nombre de routes du registre ROUTES (EF-6) : chaque route est une entrée `defineRoute(…)` d'un
 * module importé par `packages/contracts/src/routes.ts` (les modules non fusionnés et les
 * fichiers de test ne comptent pas). Un arbre partiel (tests) rend 0.
 */
export function countRegistryRoutes(root = ROOT) {
  const registry = path.join(root, 'packages', 'contracts', 'src', 'routes.ts');
  if (!fs.existsSync(registry)) return 0;
  const modules = [...fs.readFileSync(registry, 'utf8').matchAll(/from '\.\/([\w-]+)'/g)].map(
    (match) => match[1],
  );
  let total = 0;
  for (const name of modules) {
    const file = path.join(root, 'packages', 'contracts', 'src', `${name}.ts`);
    if (!fs.existsSync(file)) continue;
    total += fs.readFileSync(file, 'utf8').match(/defineRoute\(/g)?.length ?? 0;
  }
  return total;
}

/**
 * Mesure le couplage de apps/web sur l'arbre courant (EF-6) : fichiers .ts/.tsx important un
 * paquet serveur par catégorie (`app/api` compte à part ; test/ et e2e/ sont exemptés, EF-4),
 * routes du registre ROUTES, fichiers route.ts et composants client couplés.
 */
export function measureWebBoundary(root = ROOT) {
  const coupled = [];
  const clientComponents = [];
  let routeFiles = 0;
  const byCategory = Object.fromEntries(WEB_CATEGORIES.map((category) => [category, 0]));
  for (const file of listWebFiles(root)) {
    if (file.startsWith('apps/web/app/') && /(^|\/)route\.ts$/.test(file)) routeFiles += 1;
    const category = categorizeWebFile(file);
    if (category === null) continue;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (!importsServerPackage(text)) continue;
    coupled.push({ file, category });
    byCategory[category] += 1;
    const directive = text.trimStart();
    if (directive.startsWith("'use client'") || directive.startsWith('"use client"')) {
      clientComponents.push(file);
    }
  }
  return {
    coupled,
    byCategory,
    clientComponents: clientComponents.sort(),
    routesRegistry: countRegistryRoutes(root),
    routeFiles,
  };
}

/** Rapport écrit dans progress/migration.json (EF-6) ; aucune date : le fichier est versionné. */
export function progressFrom(measure) {
  return {
    coupling: measure.byCategory,
    routes: { registry: measure.routesRegistry, routeFiles: measure.routeFiles },
    clientComponents: measure.clientComponents,
  };
}

/** Liste de référence (ET-3) : fichiers couplés hors `app/api` (couverts par le glob), triés. */
export function baselineFrom(measure) {
  return {
    files: measure.coupled
      .filter((entry) => entry.category !== 'apiRoutes')
      .map((entry) => entry.file)
      .sort(),
    globs: [API_GLOB],
  };
}

/**
 * EF-5 — la liste de référence ne peut que diminuer : chaque entrée doit exister, importer
 * encore un paquet serveur et rester dans le périmètre mesuré. Retourne les erreurs (vide si la
 * liste est à jour).
 */
export function baselineErrors(baseline, root = ROOT) {
  const errors = [];
  const coupled = new Set(
    measureWebBoundary(root)
      .coupled.filter((entry) => entry.category !== 'apiRoutes')
      .map((entry) => entry.file),
  );
  for (const file of baseline.files) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      errors.push(`fichier absent : ${file}`);
      continue;
    }
    if (!importsServerPackage(fs.readFileSync(full, 'utf8'))) {
      errors.push(`entrée périmée : ${file}`);
      continue;
    }
    if (!coupled.has(file)) errors.push(`entrée hors périmètre : ${file}`);
  }
  return errors;
}

function readBaseline(root = ROOT) {
  const file = path.join(root, 'tools', 'migration', 'web-boundary-baseline.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function writeProgress(report, root = ROOT) {
  const file = path.join(root, 'progress', 'migration.json');
  writeJson(file, report);
  return file;
}

/** Point d'entrée : affiche le rapport, écrit progress/migration.json, puis contrôle la liste. */
export function main(argv = process.argv.slice(2), root = ROOT) {
  const measure = measureWebBoundary(root);
  const existing = readBaseline(root);

  console.log('Couplage de apps/web (SPEC-1001, ADR-1003) :');
  for (const category of WEB_CATEGORIES) {
    console.log(`  ${category.padEnd(11)}${String(measure.byCategory[category] ?? 0)}`);
  }
  const horsApi = WEB_CATEGORIES.filter((category) => category !== 'apiRoutes').reduce(
    (total, category) => total + (measure.byCategory[category] ?? 0),
    0,
  );
  console.log(`  ${'total'.padEnd(11)}${String(horsApi)} (hors app/api)`);
  console.log(`Routes du registre ROUTES : ${String(measure.routesRegistry)}`);
  console.log(`Fichiers route.ts sous apps/web/app : ${String(measure.routeFiles)}`);
  console.log(`Composants client couplés : ${String(measure.clientComponents.length)}`);
  for (const file of measure.clientComponents) console.log(`  ${file}`);

  const written = writeProgress(progressFrom(measure), root);
  console.log(`Rapport écrit : ${path.relative(root, written)}`);

  if (argv.includes('--write-baseline')) {
    const next = baselineFrom(measure);
    if (existing !== null && existing.files.length > 0) {
      const previous = new Set(existing.files);
      const added = next.files.filter((file) => !previous.has(file));
      if (added.length > 0) {
        console.error('La liste de référence ne peut que diminuer (ET-3) ; refus d’ajouter :');
        for (const file of added) console.error(`  ${file}`);
        process.exitCode = 1;
        return;
      }
    }
    const file = path.join(root, 'tools', 'migration', 'web-boundary-baseline.json');
    writeJson(file, next);
    console.log(`Liste de référence écrite : ${path.relative(root, file)}`);
    return;
  }
  if (existing === null) {
    console.log('Liste de référence absente : node tools/migration/report.mjs --write-baseline');
    return;
  }
  console.log(
    `Liste de référence : ${String(existing.files.length)} fichiers + ${existing.globs.join(', ')}`,
  );
  const errors = baselineErrors(existing, root);
  for (const error of errors) console.error(error);
  if (errors.length > 0) process.exitCode = 1;
}

// Exécution directe uniquement (`node tools/migration/report.mjs`) : les tests importent le
// module sans déclencher le rapport.
const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) main();
