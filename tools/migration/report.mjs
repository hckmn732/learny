// Frontière de `apps/web` après le retrait du backend TypeScript (SPEC-2302, ADR-1003, ADR-1007).
// Aucune dépendance externe : Node.js ≥ 24 pur, l'analyse des imports se fait par expressions
// régulières sur `from '…'` et `import('…')`, jamais par exécution du code.
//
// SPEC-2302 EF-2 : les paquets serveur (`services`, `jobs`, `llm`, `tutor`, `http`, `api-routes`…)
// n'existent plus, donc une liste d'interdits serait vide et ne prouverait rien. Le contrôle porte
// désormais sur ce qui peut encore casser : tout import `@learny/<paquet>` de `apps/web` doit
// désigner un paquet **présent** dans `packages/`. Un import fantôme signale le reliquat d'un
// paquet retiré (ou un paquet oublié dans le graphe), et le rapport recense ce que le web consomme.
//
// Racine injectable : MIGRATION_ROOT est réservée aux tests (comme SDD_ROOT dans tools/sdd).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ROOT = process.env.MIGRATION_ROOT
  ? path.resolve(process.env.MIGRATION_ROOT)
  : REPO_ROOT;

/** `from '@learny/db/schema'`, `import('@learny/bricks')` : le nom du paquet, jamais un préfixe. */
const IMPORT_RE = /(?:from\s+|import\(\s*)['"]@learny\/([a-z0-9-]+)(?:\/[^'"]*)?['"]/g;

function listFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.turbo')
      continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/** Paquets du workspace TypeScript (`packages/<nom>`), triés. */
export function workspacePackages(root = ROOT) {
  const dir = path.join(root, 'packages');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();
}

/** Imports `@learny/<paquet>` d'un texte, avec les paquets réellement présents. */
export function learnyImports(text, packages) {
  const found = [];
  for (const match of text.matchAll(IMPORT_RE)) {
    found.push({ name: match[1], resolved: packages.includes(match[1]) });
  }
  return found;
}

/** Fichiers .ts/.tsx de `apps/web` (hors tests et e2e : ils ne partent pas dans le build). */
export function listWebFiles(root = ROOT) {
  return listFiles(path.join(root, 'apps', 'web'), (file) => /\.(ts|tsx)$/.test(file))
    .map((file) => relative(root, file))
    .filter((file) => !file.includes('/e2e/') && !/\.(test|spec)\.tsx?$/.test(file))
    .sort();
}

/** Nombre d'opérations de `api/openapi.yaml` (le contrat vit hors de TypeScript, ADR-2012). */
export function contractOperations(root = ROOT) {
  const file = path.join(root, 'api', 'openapi.yaml');
  if (!fs.existsSync(file)) return 0;
  return (fs.readFileSync(file, 'utf8').match(/^\s+operationId: /gm) ?? []).length;
}

/**
 * Mesure la frontière du web : fichiers analysés, paquets importés, imports non résolus, routes du
 * contrat et fichiers `route.ts` (un `route.ts` restant serait un proxy du backend supprimé).
 */
export function measureWebBoundary(root = ROOT) {
  const packages = workspacePackages(root);
  const used = new Map();
  const unresolved = [];
  let files = 0;
  let routeFiles = 0;
  for (const file of listWebFiles(root)) {
    files += 1;
    if (/\/route\.ts$/.test(file)) routeFiles += 1;
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const entry of learnyImports(text, packages)) {
      used.set(entry.name, (used.get(entry.name) ?? 0) + 1);
      if (!entry.resolved) unresolved.push({ file, package: entry.name });
    }
  }
  return {
    files,
    packages,
    used: [...used.entries()].sort(([left], [right]) => left.localeCompare(right)),
    unresolved,
    routes: contractOperations(root),
    routeFiles,
  };
}

/** Point d'entrée : affiche le rapport puis impose zéro import non résolu. */
export function main(argv = process.argv.slice(2), root = ROOT) {
  const check = argv.includes('--check');
  const measure = measureWebBoundary(root);

  console.log('Frontière de apps/web (ADR-1003, ADR-1007, SPEC-2302) :');
  console.log(`  fichiers .ts/.tsx analysés      ${String(measure.files)}`);
  console.log(`  paquets du workspace            ${String(measure.packages.length)}`);
  console.log(`  paquets @learny importés        ${String(measure.used.length)}`);
  for (const [name, count] of measure.used) {
    console.log(`    ${name.padEnd(14)}${String(count)}`);
  }
  console.log(`  imports non résolus             ${String(measure.unresolved.length)}`);
  console.log(`  opérations du contrat           ${String(measure.routes)}`);
  console.log(`  fichiers route.ts sous apps/web ${String(measure.routeFiles)}`);

  if (measure.unresolved.length === 0) {
    console.log(
      `${check ? 'Contrôle réussi' : 'Rapport réussi'} : apps/web n’importe que des paquets ` +
        'existants ; aucun backend TypeScript ne subsiste (SPEC-2302 EF-2).',
    );
    return;
  }
  console.error('Imports @learny non résolus (paquet absent du workspace) :');
  for (const entry of measure.unresolved)
    console.error(`  ${entry.file} → @learny/${entry.package}`);
  process.exitCode = 1;
}

// Exécution directe uniquement (`node tools/migration/report.mjs`) : les tests importent le
// module sans déclencher le rapport.
const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) main();
