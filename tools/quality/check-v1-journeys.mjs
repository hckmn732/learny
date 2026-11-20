#!/usr/bin/env node
// Validation documentaire de la matrice des parcours V1 (SPEC-807 EF-8, ET-6, CA-5).
//
// Lit `docs/quality/v1-journeys.md` et vérifie chaque étape contre `specs/catalog.json`,
// `docs/product/business-rules.md`, les routes OpenAPI et celles de `apps/web/app`, puis les
// fichiers de tests et de fixtures. Les preuves restent des liens vers `evidence/SPEC-807/` :
// cochée, aucun statut écrit à la main. Le script n'écrit rien ; il sort en code 1 sur toute erreur.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MATRIX = 'docs/quality/v1-journeys.md';
export const JOURNEY_IDS = ['EF-1', 'EF-2', 'EF-3', 'EF-4', 'EF-5', 'EF-6'];
export const VISUAL_SCREENS = ['SCR-01', 'SCR-03', 'SCR-07', 'SCR-09', 'SCR-10'];
export const STEP_COLUMNS = [
  'Étape',
  'Action',
  'Route',
  'Spécification',
  'Règles métier',
  'Fixture',
  'Test',
];
export const VISUAL_COLUMNS = [
  'Écran',
  'État capturé',
  'Route',
  'Spécification',
  'Référence',
  'Test',
];

const OWN_SPEC = 'SPEC-807';
const JOURNEY_TEST_DIR = 'apps/web/e2e/journeys/';
const EVIDENCE_DIR = 'evidence/SPEC-807';
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
/** Marks of a result written by hand: a proof field is a link, never a status. */
const PREFILLED = /\[[xX✓]\]|✅|✔|☑|\b(réussi|validé|ok|passed|vert)\b/i;

function read(root, relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function codeSpans(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
}

function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparator(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

// ---------------------------------------------------------------------------------------------
// Référentiels
// ---------------------------------------------------------------------------------------------

/** Catalogue des spécifications : id → { priority, businessRules, path }. */
export function loadCatalog(root = REPO) {
  const catalog = JSON.parse(read(root, 'specs/catalog.json'));
  const specs = new Map();
  for (const spec of catalog.specs ?? []) {
    specs.set(spec.id, {
      priority: spec.priority,
      businessRules: spec.businessRules ?? [],
      path: spec.path,
    });
  }
  return specs;
}

/** Règles métier du catalogue : id → version (V1, V2…). */
export function loadBusinessRules(root = REPO) {
  const rules = new Map();
  for (const line of read(root, 'docs/product/business-rules.md').split(/\r?\n/)) {
    const match = /^\|\s*(BR-[A-Z]+-\d+)\s*\|.*\|\s*(V\d+)\s*\|[^|]*\|\s*$/.exec(line);
    if (match !== null) rules.set(match[1], match[2]);
  }
  return rules;
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Routes of the Next.js app router: page routes (`page.tsx`) and API handlers (`route.ts`) with
 * their exported HTTP methods. Route groups `(x)` disappear; `%5F` becomes `_`.
 */
export function loadRoutes(root = REPO, appDir = 'apps/web/app') {
  const routes = [];
  const base = path.join(root, appDir);
  if (!fs.existsSync(base)) return routes;
  const walk = (dir, segments) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const segment = decodeSegment(entry.name);
        const next = /^\(.+\)$/.test(segment) ? segments : [...segments, segment];
        walk(full, next);
        continue;
      }
      const page = /^page\.(tsx|ts|jsx|js)$/.test(entry.name);
      const handler = /^route\.(ts|js)$/.test(entry.name);
      if (!page && !handler) continue;
      let methods = [];
      if (handler) {
        const source = fs.readFileSync(full, 'utf8');
        methods = HTTP_METHODS.filter((method) =>
          new RegExp(
            `export\\s+(async\\s+)?(function|const|let)\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b`,
          ).test(source),
        );
      }
      routes.push({ segments, kind: page ? 'page' : 'api', methods });
    }
  };
  walk(base, []);
  const openapi = path.join(root, 'apps/api/openapi.json');
  if (fs.existsSync(openapi)) {
    const document = JSON.parse(fs.readFileSync(openapi, 'utf8'));
    for (const [pathname, operations] of Object.entries(document.paths ?? {})) {
      routes.push({
        segments: pathname
          .split('/')
          .filter(Boolean)
          .map((segment) => segment.replace(/^\{(.+)\}$/, '[$1]')),
        kind: 'api',
        methods: HTTP_METHODS.filter((method) =>
          Object.hasOwn(operations ?? {}, method.toLowerCase()),
        ),
      });
    }
  }
  return routes;
}

const DYNAMIC = /^\[{1,2}(\.\.\.)?[^\]]+\]{1,2}$/;

function segmentMatches(wanted, actual) {
  if (DYNAMIC.test(actual)) return true;
  if (DYNAMIC.test(wanted)) return false;
  return wanted === actual;
}

/** Parses « `POST /api/v1/x` » or « `/accueil?vue=1` » into { method, segments }. */
export function parseRouteRef(value) {
  const match = /^(?:(GET|POST|PUT|PATCH|DELETE)\s+)?(\/\S*)$/.exec(value.trim());
  if (match === null) return null;
  const pathname = match[2].replace(/[?#].*$/, '');
  const segments = pathname.split('/').filter((segment) => segment !== '');
  return { method: match[1] ?? null, pathname, segments };
}

/** null when the route exists, otherwise the reason. */
export function routeProblem(value, routes) {
  const ref = parseRouteRef(value);
  if (ref === null) return `route mal formée « ${value} »`;
  const candidates = routes.filter((route) => {
    const last = route.segments.at(-1) ?? '';
    const catchAll = /^\[{1,2}\.\.\./.test(last);
    if (catchAll) {
      if (ref.segments.length < route.segments.length - 1) return false;
      return route.segments
        .slice(0, -1)
        .every((segment, index) => segmentMatches(ref.segments[index] ?? '', segment));
    }
    if (route.segments.length !== ref.segments.length) return false;
    return route.segments.every((segment, index) => segmentMatches(ref.segments[index], segment));
  });
  const isApi = ref.segments[0] === 'api';
  const matching = candidates.filter((route) => route.kind === (isApi ? 'api' : 'page'));
  if (matching.length === 0) return `route inexistante ${ref.pathname}`;
  if (ref.method !== null && !matching.some((route) => route.methods.includes(ref.method))) {
    return `méthode ${ref.method} absente de ${ref.pathname}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Lecture de la matrice
// ---------------------------------------------------------------------------------------------

function parseTable(lines, start) {
  const header = splitRow(lines[start] ?? '');
  const rows = [];
  let index = start + 1;
  if (header === null) return { header: null, rows, end: index };
  const separator = splitRow(lines[index] ?? '');
  if (separator !== null && isSeparator(separator)) index += 1;
  for (; index < lines.length; index += 1) {
    const cells = splitRow(lines[index]);
    if (cells === null) break;
    rows.push({ cells, line: index + 1 });
  }
  return { header, rows, end: index };
}

function parseBullet(line) {
  const match = /^-\s+([^:]+?)\s*:\s*(.*)$/.exec(line.trim());
  return match === null ? null : { key: match[1].toLowerCase(), value: match[2] };
}

/** Structure of the matrix: journeys (EF-1…EF-6) and the visual section (EF-7). */
export function parseMatrix(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const heading = /^##\s+(EF-\d+)\s+[—-]\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      current = {
        id: heading[1],
        title: heading[2],
        line: index + 1,
        testFile: null,
        testTitle: null,
        proofs: null,
        header: null,
        rows: [],
      };
      sections.push(current);
      continue;
    }
    if (/^##\s/.test(line)) {
      current = null;
      continue;
    }
    if (current === null) continue;
    const bullet = parseBullet(line);
    if (bullet !== null) {
      if (bullet.key.startsWith('fichier de test'))
        current.testFile = codeSpans(bullet.value)[0] ?? '';
      else if (bullet.key === 'test') current.testTitle = codeSpans(bullet.value)[0] ?? '';
      else if (bullet.key.startsWith('preuve')) current.proofs = bullet.value;
      continue;
    }
    if (line.trim().startsWith('|') && current.header === null) {
      const table = parseTable(lines, index);
      current.header = table.header;
      current.rows = table.rows;
      index = table.end - 1;
    }
  }
  return sections;
}

function markdownLinks(value) {
  return [...value.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)].map((match) => ({
    label: match[1],
    href: match[2],
  }));
}

// ---------------------------------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------------------------------

function checkProofs(section, context, errors) {
  const where = `${section.id}`;
  if (section.proofs === null || section.proofs.trim() === '') {
    errors.push(`${where} : champ « Preuves » absent`);
    return;
  }
  const links = markdownLinks(section.proofs);
  if (links.length === 0)
    errors.push(`${where} : les preuves doivent être des liens vers ${EVIDENCE_DIR}/`);
  const withoutLinks = section.proofs.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, '');
  if (PREFILLED.test(withoutLinks) || links.some((link) => PREFILLED.test(link.label))) {
    errors.push(
      `${where} : preuve pré-remplie (statut ou case cochée) au lieu d'un lien de rapport`,
    );
  }
  for (const link of links) {
    const target = path.normalize(path.join(path.dirname(context.matrix), link.href));
    const relative = target.split(path.sep).join('/');
    if (/^[a-z]+:/i.test(link.href) || !relative.startsWith(`${EVIDENCE_DIR}/`)) {
      errors.push(`${where} : preuve hors de ${EVIDENCE_DIR}/ (${link.href})`);
      continue;
    }
    if (context.requireEvidence && !exists(context.root, relative)) {
      errors.push(`${where} : rapport de preuve absent ${relative}`);
    }
  }
}

function checkTestFile(file, where, context, errors, { dir }) {
  if (file === null || file === '') {
    errors.push(`${where} : fichier de test absent`);
    return;
  }
  if (!file.startsWith(dir)) errors.push(`${where} : le test doit vivre dans ${dir} (${file})`);
  if (!exists(context.root, file)) {
    errors.push(`${where} : fichier de test inexistant ${file}`);
    return;
  }
  const source = read(context.root, file);
  if (!source.includes(`@${OWN_SPEC}`)) errors.push(`${where} : ${file} ne porte pas @${OWN_SPEC}`);
}

function checkOwner(specId, rules, where, context, errors) {
  if (!/^SPEC-\d{3}$/.test(specId)) {
    errors.push(`${where} : étape sans propriétaire (spécification « ${specId || '—'} »)`);
    return;
  }
  if (specId === OWN_SPEC)
    errors.push(`${where} : SPEC-807 ne peut pas être propriétaire d'une étape`);
  const spec = context.catalog.get(specId);
  if (spec === undefined) {
    errors.push(`${where} : ${specId} absente de specs/catalog.json`);
    return;
  }
  if (spec.priority !== 'V1') errors.push(`${where} : ${specId} n'est pas une spécification V1`);
  let specText = null;
  for (const rule of rules) {
    if (spec.businessRules.includes(rule)) continue;
    if (specText === null) {
      specText =
        spec.path !== undefined && exists(context.root, spec.path)
          ? read(context.root, spec.path)
          : '';
    }
    if (!specText.includes(rule)) errors.push(`${where} : ${rule} n'est pas rattachée à ${specId}`);
  }
}

function checkRules(cell, where, context, errors) {
  const rules = cell.split(/[,\s]+/).filter((value) => value !== '');
  if (rules.length === 0 || rules.every((rule) => rule === '—' || rule === '-')) {
    errors.push(`${where} : aucune règle métier`);
    return [];
  }
  const valid = [];
  const seen = new Set();
  for (const rule of rules) {
    if (!/^BR-[A-Z]+-\d+$/.test(rule)) {
      errors.push(`${where} : règle métier mal formée « ${rule} »`);
      continue;
    }
    if (seen.has(rule)) errors.push(`${where} : règle ${rule} en doublon`);
    seen.add(rule);
    const version = context.rules.get(rule);
    if (version === undefined)
      errors.push(`${where} : ${rule} absente de docs/product/business-rules.md`);
    else if (version !== 'V1')
      errors.push(`${where} : ${rule} n'est pas une règle V1 (${version})`);
    else valid.push(rule);
  }
  return valid;
}

function checkRoutes(cell, where, context, errors) {
  const refs = codeSpans(cell);
  if (refs.length === 0) {
    errors.push(`${where} : aucune route`);
    return;
  }
  for (const ref of refs) {
    const problem = routeProblem(ref, context.routes);
    if (problem !== null) errors.push(`${where} : ${problem}`);
  }
}

function checkFixtures(cell, where, context, errors) {
  const refs = codeSpans(cell);
  if (refs.length === 0) {
    errors.push(`${where} : aucune fixture`);
    return;
  }
  for (const ref of refs) {
    if (ref.includes('/') && !exists(context.root, ref)) {
      errors.push(`${where} : fixture inexistante ${ref}`);
    }
  }
}

function checkHeader(section, expected, errors) {
  if (section.header === null) {
    errors.push(`${section.id} : tableau des étapes absent`);
    return false;
  }
  if (section.header.join('|') !== expected.join('|')) {
    errors.push(`${section.id} : colonnes attendues ${expected.join(', ')}`);
    return false;
  }
  if (section.rows.length === 0) errors.push(`${section.id} : aucune étape`);
  return true;
}

function checkJourney(section, context, stepIds, errors) {
  const number = section.id.slice(3);
  if (section.testTitle === null || !section.testTitle.includes(`@${OWN_SPEC}`)) {
    errors.push(`${section.id} : titre de test sans @${OWN_SPEC}`);
  }
  checkTestFile(section.testFile, section.id, context, errors, { dir: JOURNEY_TEST_DIR });
  checkProofs(section, context, errors);
  if (!checkHeader(section, STEP_COLUMNS, errors)) return 0;

  const actions = new Set();
  for (const row of section.rows) {
    const [step, action, route, spec, rules, fixture, test] = row.cells;
    const where = `${section.id} ${step || `ligne ${String(row.line)}`}`;
    if (row.cells.length !== STEP_COLUMNS.length) {
      errors.push(
        `${where} : ${String(row.cells.length)} colonnes au lieu de ${String(STEP_COLUMNS.length)}`,
      );
      continue;
    }
    if (!new RegExp(`^J${number}\\.\\d{2}$`).test(step)) {
      errors.push(`${where} : identifiant d'étape attendu J${number}.nn`);
    }
    if (stepIds.has(step)) errors.push(`${where} : étape en doublon`);
    stepIds.add(step);
    if (action === '') errors.push(`${where} : action vide`);
    const normalised = action.toLowerCase();
    if (actions.has(normalised)) errors.push(`${where} : action en doublon dans le parcours`);
    actions.add(normalised);
    if (PREFILLED.test(test) || PREFILLED.test(fixture)) {
      errors.push(`${where} : statut écrit à la main dans la matrice`);
    }
    checkRoutes(route, where, context, errors);
    const valid = checkRules(rules, where, context, errors);
    checkOwner(spec, valid, where, context, errors);
    checkFixtures(fixture, where, context, errors);
    const testFile = codeSpans(test)[0] ?? '';
    checkTestFile(testFile, where, context, errors, { dir: JOURNEY_TEST_DIR });
    if (section.testFile !== null && testFile !== '' && testFile !== section.testFile) {
      errors.push(
        `${where} : test ${testFile} différent du fichier du parcours ${section.testFile}`,
      );
    }
  }
  return section.rows.length;
}

function loadManifest(root) {
  const file = 'design/references/manifest.json';
  if (!exists(root, file)) return new Set();
  const manifest = JSON.parse(read(root, file));
  return new Set((manifest.references ?? []).map((entry) => entry.file));
}

function checkVisual(section, context, errors) {
  if (section.testTitle === null || !section.testTitle.includes('@visual')) {
    errors.push(`${section.id} : titre de test sans @visual`);
  }
  if (section.testTitle !== null && !section.testTitle.includes(`@${OWN_SPEC}`)) {
    errors.push(`${section.id} : titre de test sans @${OWN_SPEC}`);
  }
  checkTestFile(section.testFile, section.id, context, errors, { dir: JOURNEY_TEST_DIR });
  checkProofs(section, context, errors);
  if (!checkHeader(section, VISUAL_COLUMNS, errors)) return;
  const manifest = loadManifest(context.root);
  const screens = new Set();
  for (const row of section.rows) {
    const [screen, state, route, spec, reference, test] = row.cells;
    const where = `${section.id} ${screen || `ligne ${String(row.line)}`}`;
    if (row.cells.length !== VISUAL_COLUMNS.length) {
      errors.push(
        `${where} : ${String(row.cells.length)} colonnes au lieu de ${String(VISUAL_COLUMNS.length)}`,
      );
      continue;
    }
    if (screens.has(screen)) errors.push(`${where} : écran en doublon`);
    screens.add(screen);
    if (state === '') errors.push(`${where} : état capturé vide`);
    checkRoutes(route, where, context, errors);
    checkOwner(spec, [], where, context, errors);
    for (const file of codeSpans(reference)) {
      if (!exists(context.root, file)) errors.push(`${where} : référence absente ${file}`);
      else if (!manifest.has(file)) errors.push(`${where} : ${file} absente du manifeste`);
      if (!file.includes(`${screen}-`))
        errors.push(`${where} : référence ${file} d'un autre écran`);
    }
    if (codeSpans(reference).length === 0) errors.push(`${where} : référence maquette absente`);
    const testFile = codeSpans(test)[0] ?? '';
    checkTestFile(testFile, where, context, errors, { dir: JOURNEY_TEST_DIR });
  }
  for (const screen of VISUAL_SCREENS) {
    if (!screens.has(screen)) errors.push(`${section.id} : écran ${screen} absent`);
  }
}

/**
 * Validates the matrix. `options.root` points at a repository (fixtures in tests),
 * `options.requireEvidence` also requires every linked report to exist.
 */
export function checkJourneys(options = {}) {
  const root = options.root ?? REPO;
  const matrix = options.matrix ?? MATRIX;
  const errors = [];
  if (!exists(root, matrix)) {
    return { ok: false, errors: [`${matrix} : matrice absente`], journeys: 0, steps: 0 };
  }
  const context = {
    root,
    matrix,
    requireEvidence: options.requireEvidence === true,
    catalog: loadCatalog(root),
    rules: loadBusinessRules(root),
    routes: loadRoutes(root),
  };
  const sections = parseMatrix(read(root, matrix));
  const seen = new Set();
  const stepIds = new Set();
  let steps = 0;
  for (const section of sections) {
    if (seen.has(section.id)) {
      errors.push(`${section.id} : parcours en doublon`);
      continue;
    }
    seen.add(section.id);
    if (JOURNEY_IDS.includes(section.id)) steps += checkJourney(section, context, stepIds, errors);
    else if (section.id === 'EF-7') checkVisual(section, context, errors);
    else errors.push(`${section.id} : section inconnue`);
  }
  for (const id of JOURNEY_IDS) {
    if (!seen.has(id)) errors.push(`${id} : parcours absent de la matrice`);
  }
  if (!seen.has('EF-7')) errors.push('EF-7 : section de régression visuelle absente');
  return {
    ok: errors.length === 0,
    errors,
    journeys: JOURNEY_IDS.filter((id) => seen.has(id)).length,
    steps,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = checkJourneys({ requireEvidence: process.argv.includes('--require-evidence') });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(
      `✔ matrice des parcours V1 cohérente : ${String(report.journeys)} parcours, ${String(report.steps)} étapes.`,
    );
  } else {
    console.error(report.errors.map((error) => `✖ ${error}`).join('\n'));
  }
  process.exit(report.ok ? 0 : 1);
}
