// SPEC-2001 — inventory extractor (ADR-2005, ADR-2011).
//
// Produces `api/inventory.json` and `evidence/SPEC-2001/inventory.md` from the live contract
// registry, the special-route manifest, the event catalog and the job definitions.
//
// Run with tsx (it imports the TypeScript registries directly, never a regular expression on
// `ROUTES`): `corepack pnpm exec tsx tools/migration/inventory.mjs [--check]`.
//
// `--check` regenerates in memory and exits 1 when the committed JSON differs: an operation,
// event or job added or removed without updating the inventory breaks the build (CA-2).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ROOT = process.env.MIGRATION_ROOT
  ? path.resolve(process.env.MIGRATION_ROOT)
  : REPO_ROOT;

/** Target context of every implementation module (ADR-2003, P20 plan §"Default mapping"). */
export const CONTEXT_BY_MODULE = {
  agenda: 'learning',
  'agenda-deplacer-et-reajuster-le-planning': 'learning',
  'ai-credentials': 'tutor',
  attempts: 'assessments',
  auth: 'identity',
  'automatisme-10-mode-pause-et-retour': 'engagement',
  'automatisme-9-bilan-de-la-semaine': 'engagement',
  billing: 'billing',
  bricks: 'assessments',
  cadrage: 'formation',
  course: 'content',
  'course-reading': 'content',
  dev: 'dev',
  'dev-sdd': 'dev',
  email: 'engagement',
  exercises: 'assessments',
  'final-review': 'learning',
  'formation-management': 'formation',
  'formations-a-plusieurs': 'formation',
  gaps: 'learning',
  header: 'identity',
  home: 'identity',
  legal: 'identity',
  me: 'identity',
  'mock-exams': 'assessments',
  'moteur-d-automatismes': 'engagement',
  notifications: 'engagement',
  'notion-graph': 'formation',
  offline: 'assessments',
  'parametres-modeles-d-ia': 'tutor',
  'parametres-notifications': 'engagement',
  'parametres-onglets-et-profil': 'identity',
  'personal-data': 'privacy',
  programme: 'formation',
  push: 'engagement',
  'quiz-result': 'assessments',
  resources: 'content',
  review: 'learning',
  search: 'formation',
  'serie-regularite-et-jalons-interface': 'learning',
  sidebar: 'identity',
  'tutor-chat': 'tutor',
  uploads: 'content',
  warmup: 'learning',
};

/** Spec that ports a context (P20 plan). */
export const SPEC_BY_CONTEXT = {
  identity: 'SPEC-2201',
  formation: 'SPEC-2201',
  learning: 'SPEC-2202',
  assessments: 'SPEC-2202',
  content: 'SPEC-2203',
  tutor: 'SPEC-2204',
  engagement: 'SPEC-2205',
  billing: 'SPEC-2206',
  privacy: 'SPEC-2206',
  'jobs-demo': 'SPEC-2102',
  dev: 'SPEC-2207',
  special: 'SPEC-2207',
};

const TEST_FILE_RE = /\.(?:test|spec)\.(?:ts|tsx)$/;
const TEST_DIRS = ['apps', 'packages'];

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function listFiles(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * Route key -> implementation module (base name), read from `implementations/<module>.ts`.
 * The contract key is the first property of the exported `*Implementations` object.
 */
export function implementationModules(root = ROOT) {
  const dir = path.join(root, 'packages', 'api-routes', 'src', 'implementations');
  const mapping = new Map();
  for (const file of listFiles(dir, (f) => f.endsWith('.ts') && !TEST_FILE_RE.test(f))) {
    const source = readText(file);
    const start = source.search(/Implementations\s*=\s*\{/);
    if (start === -1) continue;
    const moduleName = path.basename(file, '.ts');
    for (const match of source.slice(start).matchAll(/^\s{2}(\w+):/gm)) {
      mapping.set(match[1], moduleName);
    }
  }
  return mapping;
}

/** Resolves `id: SOME_CONSTANT` to the string literal declared in the same file. */
function resolveJobId(source) {
  const direct = source.match(/id:\s*'([^']+)'/)?.[1];
  if (direct !== undefined) return direct;
  const reference = source.match(/id:\s*([A-Z][A-Z0-9_]+)\s*,/)?.[1];
  if (reference === undefined) return undefined;
  return source.match(new RegExp(`const\\s+${reference}\\s*=\\s*'([^']+)'`))?.[1];
}

/** Job definitions parsed statically from `packages/jobs/src/functions/*.ts`. */
export function jobDefinitions(root = ROOT) {
  const dir = path.join(root, 'packages', 'jobs', 'src', 'functions');
  const jobs = [];
  for (const file of listFiles(
    dir,
    (f) => f.endsWith('.ts') && !TEST_FILE_RE.test(f) && f !== 'index.ts',
  )) {
    const source = readText(file);
    if (!source.includes('defineFunction(')) continue;
    const id = resolveJobId(source);
    if (id === undefined) continue;
    const event = source.match(/event:\s*'([^']+)'/)?.[1];
    const cron = source.match(/cron:\s*'([^']+)'/)?.[1];
    const retries = source.match(/retries:\s*(\d+)/)?.[1];
    jobs.push({
      id,
      module: relative(root, file),
      trigger: event ?? (cron === undefined ? null : { cron }),
      retries: retries === undefined ? null : Number(retries),
    });
  }
  return jobs.sort((a, b) => a.id.localeCompare(b.id));
}

/** Event producers/consumers, best effort from `outbox.emit` / job triggers. */
export function eventUsage(root = ROOT) {
  const files = [
    ...listFiles(path.join(root, 'packages'), (f) => f.endsWith('.ts') && !TEST_FILE_RE.test(f)),
    ...listFiles(path.join(root, 'apps'), (f) => f.endsWith('.ts') && !TEST_FILE_RE.test(f)),
  ];
  const producers = new Map();
  const consumers = new Map();
  for (const file of files) {
    const source = readText(file);
    const rel = relative(root, file);
    for (const match of source.matchAll(/(?:emit|add)\(\s*'([a-z][a-z0-9-]*\/[a-z0-9-]+)'/g)) {
      if (!producers.has(match[1])) producers.set(match[1], new Set());
      producers.get(match[1]).add(rel);
    }
    for (const match of source.matchAll(/event:\s*'([a-z][a-z0-9-]*\/[a-z0-9-]+)'/g)) {
      if (!consumers.has(match[1])) consumers.set(match[1], new Set());
      consumers.get(match[1]).add(rel);
    }
  }
  const toSorted = (map) =>
    Object.fromEntries(
      [...map.entries()].map(([k, v]) => [k, [...v].sort()]).sort(([a], [b]) => a.localeCompare(b)),
    );
  return { producers: toSorted(producers), consumers: toSorted(consumers) };
}

/** Test files referencing a route id or path (Vitest `[SPEC-x]`, Playwright `@SPEC-x`). */
export function testIndex(root = ROOT) {
  const files = TEST_DIRS.flatMap((dir) =>
    listFiles(path.join(root, dir), (f) => TEST_FILE_RE.test(f) && !f.includes('/node_modules/')),
  );
  const index = new Map();
  for (const file of files) {
    const source = readText(file);
    const rel = relative(root, file);
    const tags = [...source.matchAll(/\[(SPEC-\d+)\]|@(SPEC-\d+)/g)].map((m) => m[1] ?? m[2]);
    index.set(rel, { source, tags: [...new Set(tags)].sort() });
  }
  return index;
}

function testsFor(entry, index) {
  const found = [];
  const needles = [entry.id, entry.path];
  for (const [file, { source }] of index) {
    if (needles.some((needle) => source.includes(needle))) found.push(file);
  }
  return found.sort();
}

const SERVICES_INDEX_CACHE = new Map();

/** name -> file under `packages/services/src`, for `import { name } from '@learny/services'`. */
function servicesIndex(root) {
  if (SERVICES_INDEX_CACHE.has(root)) return SERVICES_INDEX_CACHE.get(root);
  const index = new Map();
  const dir = path.join(root, 'packages', 'services', 'src');
  for (const file of listFiles(dir, (f) => f.endsWith('.ts') && !TEST_FILE_RE.test(f))) {
    const source = readText(file);
    for (const match of source.matchAll(
      /export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      if (!index.has(match[1])) index.set(match[1], file);
    }
  }
  SERVICES_INDEX_CACHE.set(root, index);
  return index;
}

const SQL_STOPWORDS = new Set([
  'select',
  'where',
  'set',
  'values',
  'on',
  'the',
  'and',
  'null',
  'true',
  'false',
  'into',
  'from',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'cross',
  'lateral',
  'with',
  'using',
]);

/** SQL table names read/written by an implementation and the services it calls (ET-3, best effort). */
export function tablesForModule(root, moduleFile) {
  const tables = new Set();
  const visited = new Set();
  const index = servicesIndex(root);
  const scan = (file, depth) => {
    if (depth > 2 || visited.has(file) || !fs.existsSync(file)) return;
    visited.add(file);
    const source = readText(file);
    for (const match of source.matchAll(
      /\b(?:from|into|update|join)\s+(?:[a-z_][a-z0-9_]*\.)?([a-z][a-z0-9_]{2,})\b(?!\s*\()/gi,
    )) {
      const name = match[1].toLowerCase();
      if (!SQL_STOPWORDS.has(name)) tables.add(name);
    }
    for (const importMatch of source.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*'@learny\/services'/g,
    )) {
      for (const rawName of importMatch[1].split(',')) {
        const name = rawName
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        const target = name === undefined ? undefined : index.get(name);
        if (target !== undefined) scan(target, depth + 1);
      }
    }
    for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(file), match[1]);
      scan(target.endsWith('.ts') ? target : `${target}.ts`, depth + 1);
    }
  };
  scan(moduleFile, 0);
  return [...tables].sort();
}

function contextOf(key, moduleName) {
  if (key.startsWith('devJobs'))
    return { context: 'jobs-demo', spec: SPEC_BY_CONTEXT['jobs-demo'] };
  if (moduleName !== undefined && CONTEXT_BY_MODULE[moduleName] !== undefined) {
    const context = CONTEXT_BY_MODULE[moduleName];
    return { context, spec: SPEC_BY_CONTEXT[context] };
  }
  return { context: 'dev', spec: SPEC_BY_CONTEXT.dev };
}

/**
 * Builds the inventory. `deps` is injectable so unit tests run on fixtures without tsx.
 */
export function buildInventory({ root = ROOT, deps }) {
  const { routes, special, events, jobs, usage, index } = deps;
  const modules = implementationModules(root);
  const operations = Object.entries(routes)
    .map(([key, route]) => {
      const moduleName = modules.get(key);
      const { context, spec } = contextOf(key, moduleName);
      const entry = {
        key,
        id: route.id,
        method: route.method,
        path: route.path,
        auth: route.auth,
        rateLimit: route.rateLimit ?? 'default',
        idempotent: route.idempotent === true,
        requiresIdempotencyKey: route.requiresIdempotencyKey === true,
        freshAuth: route.freshAuth === true,
        legalAcceptance: route.legalAcceptance === true,
        validationStatus: route.validationStatus ?? 400,
        successStatus: route.successStatus,
        errors: [...route.errors].sort(),
        summary: route.summary,
        context,
        spec,
        implementation:
          moduleName === undefined
            ? null
            : `packages/api-routes/src/implementations/${moduleName}.ts`,
        tables:
          moduleName === undefined
            ? []
            : tablesForModule(
                root,
                path.join(
                  root,
                  'packages',
                  'api-routes',
                  'src',
                  'implementations',
                  `${moduleName}.ts`,
                ),
              ),
        events: [],
        tests: [],
      };
      entry.tests = testsFor(entry, index);
      entry.gap = entry.tests.length === 0;
      return entry;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const operationsById = new Map(operations.map((entry) => [entry.id, entry]));
  for (const [name, producers] of Object.entries(usage.producers)) {
    for (const file of producers) {
      for (const entry of operations) {
        if (
          entry.implementation !== null &&
          file.startsWith(entry.implementation.replace(/\.ts$/, ''))
        ) {
          if (!entry.events.includes(name)) entry.events.push(name);
        }
      }
    }
  }
  for (const entry of operations) entry.events.sort();

  const specialEntries = special
    .map((item) => {
      const operation = operationsById.get(`special:${item.key}`) ?? null;
      return {
        key: item.key,
        method: item.method,
        path: item.path,
        context: 'special',
        spec: SPEC_BY_CONTEXT.special,
        inRegistry: Object.values(routes).some(
          (route) => route.path === item.path && route.method === item.method,
        ),
        tests: operation === null ? [] : operation.tests,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const eventEntries = Object.keys(events)
    .sort()
    .map((name) => ({
      name,
      producers: usage.producers[name] ?? [],
      consumers: usage.consumers[name] ?? [],
    }));

  return {
    generatedFrom: 'SPEC-2001',
    counts: {
      operations: operations.length,
      special: specialEntries.length,
      events: eventEntries.length,
      jobs: jobs.length,
      gaps: operations.filter((entry) => entry.gap).length,
    },
    operations,
    special: specialEntries,
    events: eventEntries,
    jobs,
  };
}

/** Markdown rendering of the inventory (CA-1). */
export function renderInventoryMarkdown(inventory) {
  const lines = [];
  lines.push('# Inventory — TypeScript backend on `main` (SPEC-2001)');
  lines.push('');
  lines.push(
    'Generated by `corepack pnpm exec tsx tools/migration/inventory.mjs` from the live registries. ' +
      'Do not edit by hand: `--check` fails when this file drifts from the code (CA-2).',
  );
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('|---|---|');
  lines.push(`| Operations (\`ROUTES\`) | ${inventory.counts.operations} |`);
  lines.push(`| Special routes | ${inventory.counts.special} |`);
  lines.push(`| Events | ${inventory.counts.events} |`);
  lines.push(`| Jobs | ${inventory.counts.jobs} |`);
  lines.push(`| Operations without test (CL-1 gaps) | ${inventory.counts.gaps} |`);
  lines.push('');
  lines.push('## Operations by target context');
  lines.push('');
  const byContext = new Map();
  for (const op of inventory.operations) {
    if (!byContext.has(op.context)) byContext.set(op.context, []);
    byContext.get(op.context).push(op);
  }
  lines.push('| Context | Spec | Operations |');
  lines.push('|---|---|---|');
  for (const [context, ops] of [...byContext.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`| ${context} | ${ops[0].spec} | ${ops.length} |`);
  }
  lines.push('');
  lines.push('## Operations');
  lines.push('');
  lines.push('| Id | Method | Path | Auth | Context | Spec | Impl | Tables | Tests | Gap |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const op of inventory.operations) {
    const tests = op.tests.length === 0 ? '—' : op.tests.map((t) => `\`${t}\``).join('<br>');
    const tables = op.tables.length === 0 ? '—' : op.tables.join(', ');
    lines.push(
      `| \`${op.id}\` | ${op.method} | \`${op.path}\` | ${op.auth} | ${op.context} | ${op.spec} | ` +
        `${op.implementation === null ? '—' : `\`${op.implementation}\``} | ${tables} | ${tests} | ${op.gap ? 'CL-1' : ''} |`,
    );
  }
  lines.push('');
  lines.push('## Special routes');
  lines.push('');
  lines.push('| Key | Method | Path | In registry | Tests |');
  lines.push('|---|---|---|---|---|');
  for (const item of inventory.special) {
    lines.push(
      `| \`${item.key}\` | ${item.method} | \`${item.path}\` | ${item.inRegistry ? 'yes' : 'no'} | ${item.tests.length} |`,
    );
  }
  lines.push('');
  lines.push('## Events');
  lines.push('');
  lines.push('| Event | Producers | Consumers |');
  lines.push('|---|---|---|');
  for (const event of inventory.events) {
    lines.push(`| \`${event.name}\` | ${event.producers.length} | ${event.consumers.length} |`);
  }
  lines.push('');
  lines.push('## Jobs');
  lines.push('');
  lines.push('| Id | Trigger | Retries | Module |');
  lines.push('|---|---|---|---|');
  for (const job of inventory.jobs) {
    const trigger =
      typeof job.trigger === 'string'
        ? job.trigger
        : job.trigger === null
          ? '—'
          : `cron ${job.trigger.cron}`;
    lines.push(`| \`${job.id}\` | ${trigger} | ${job.retries ?? '—'} | \`${job.module}\` |`);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

export function serialize(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

/** Backend packages whose tests are ported to pytest (ADR-2008). Web tests stay as they are. */
export const BACKEND_PACKAGES = [
  'core',
  'config',
  'contracts',
  'db',
  'services',
  'jobs',
  'llm',
  'tutor',
  'ingestion',
  'learning-engine',
  'notifications',
  'automations',
  'http',
  'api-routes',
  'bricks',
];

function slugOf(file) {
  return path
    .basename(file)
    .replace(/\.(?:test|spec)\.tsx?$/, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase();
}

/** Area and business context of the future Python test module. */
function portArea(relativePath) {
  const parts = relativePath.split('/');
  if (parts[0] === 'apps') return { area: 'api', raw: 'api' };
  const packageName = parts[1] ?? 'shared';
  const srcIndex = parts.indexOf('src');
  const kindIndex = parts.findIndex((part) => part === 'integration' || part === 'unit');
  let raw;
  if (srcIndex !== -1 && parts.length > srcIndex + 2) raw = parts[srcIndex + 1];
  else if (kindIndex !== -1 && parts.length > kindIndex + 2) raw = parts[kindIndex + 1];
  if (raw === undefined) {
    raw = path.basename(parts[parts.length - 1]).replace(/\.(?:test|spec)\.tsx?$/, '');
  }
  const area =
    packageName === 'services' || packageName === 'api-routes'
      ? (CONTEXT_BY_MODULE[raw] ?? raw)
      : packageName;
  return { area, raw };
}

/** Spec of the python-migration track that ports a backend package (or a services area). */
export function trackSpecFor(packageName, area) {
  const byPackage = {
    core: 'SPEC-2003',
    config: 'SPEC-2003',
    contracts: 'SPEC-2003',
    http: 'SPEC-2003',
    'api-routes': 'SPEC-2003',
    db: 'SPEC-2101',
    jobs: 'SPEC-2102',
    automations: 'SPEC-2102',
    'learning-engine': 'SPEC-2202',
    bricks: 'SPEC-2202',
    ingestion: 'SPEC-2203',
    llm: 'SPEC-2204',
    tutor: 'SPEC-2204',
    notifications: 'SPEC-2205',
    testing: 'SPEC-2003',
  };
  if (packageName === 'services')
    return SPEC_BY_CONTEXT[CONTEXT_BY_MODULE[area] ?? area] ?? 'SPEC-2207';
  return byPackage[packageName] ?? 'SPEC-2207';
}

/**
 * One row per backend test file: file, test count, target pytest module, target spec, status.
 * The pytest module is a *plan*: `TODO` rows are written by the spec that ports the package
 * (ADR-2008, evidence/SPEC-2001/test-port-map.md).
 */
export function buildPortMap(root = ROOT) {
  const rows = [];
  for (const packageName of BACKEND_PACKAGES) {
    for (const file of listFiles(path.join(root, 'packages', packageName), (f) =>
      TEST_FILE_RE.test(f),
    )) {
      const source = readText(file);
      const rel = relative(root, file);
      const count = source.match(/\b(?:it|test)(?:\.\w+)?\(\s*['"`]/g)?.length ?? 0;
      const tags = [
        ...new Set([...source.matchAll(/\[(SPEC-\d+)\]|@(SPEC-\d+)/g)].map((m) => m[1] ?? m[2])),
      ].sort();
      const integration = rel.includes('/test/integration/') || rel.includes('/tests/integration/');
      const kind = integration ? 'integration' : 'unit';
      const { area, raw } = portArea(rel);
      rows.push({
        file: rel,
        tests: count,
        tags,
        python: `packages-py/learny/tests/${kind}/${area}/test_${slugOf(file)}.py`,
        spec: trackSpecFor(packageName, raw),
        status: 'todo',
      });
    }
  }
  // API application tests (apps/api) are ported with the facade (SPEC-2003).
  for (const file of listFiles(path.join(root, 'apps', 'api'), (f) => TEST_FILE_RE.test(f))) {
    const source = readText(file);
    const rel = relative(root, file);
    const tags = [
      ...new Set([...source.matchAll(/\[(SPEC-\d+)\]|@(SPEC-\d+)/g)].map((m) => m[1] ?? m[2])),
    ].sort();
    const integration = rel.includes('/test/integration/');
    rows.push({
      file: rel,
      tests: source.match(/\b(?:it|test)(?:\.\w+)?\(\s*['"`]/g)?.length ?? 0,
      tags,
      python: `apps/api-py/tests/${integration ? 'integration' : 'unit'}/test_${slugOf(file)}.py`,
      spec: 'SPEC-2003',
      status: 'todo',
    });
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file));
}

export function renderPortMap(rows) {
  const total = rows.reduce((sum, row) => sum + row.tests, 0);
  const lines = [
    '# Test port map — TypeScript backend to pytest (SPEC-2001, ADR-2008)',
    '',
    'Generated by `corepack pnpm exec tsx tools/migration/inventory.mjs --port-map`.',
    'One row per backend test file: the pytest module is the planned landing zone, `status` becomes',
    '`ported` in the spec that writes it (ADR-2008 keeps the same cases and the same expected values).',
    '`apps/web` tests are out of this map: they stay in TypeScript (the web keeps its suite).',
    '',
    `Total backend test files: ${rows.length} — test cases: ${total}.`,
    '',
    '| File | Tests | Tags | Target pytest module | Target spec | Status |',
    '|---|---|---|---|---|---|',
  ];
  for (const row of rows) {
    lines.push(
      `| \`${row.file}\` | ${row.tests} | ${row.tags.join(', ') || '—'} | \`${row.python}\` | ${row.spec || '—'} | ${row.status} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

async function loadRegistries(root) {
  const load = async (relativePath) => import(pathToFileURL(path.join(root, relativePath)).href);
  const { ROUTES } = await load('packages/contracts/src/routes.ts');
  const { SPECIAL_ROUTE_MANIFEST } = await load('packages/api-routes/src/special/manifest.ts');
  const { EVENTS } = await load('packages/contracts/src/events.ts');
  return { routes: ROUTES, special: SPECIAL_ROUTE_MANIFEST, events: EVENTS };
}

export async function main(argv = process.argv.slice(2), root = ROOT) {
  const check = argv.includes('--check');
  if (argv.includes('--port-map')) {
    const markdownPath = path.join(root, 'evidence', 'SPEC-2001', 'test-port-map.md');
    const rows = buildPortMap(root);
    const markdown = renderPortMap(rows);
    if (check) {
      const current = fs.existsSync(markdownPath) ? readText(markdownPath) : '';
      if (current !== markdown) {
        console.error(
          'Test port map drift: regenerate evidence/SPEC-2001/test-port-map.md (CA-4).',
        );
        process.exitCode = 1;
      } else {
        console.log(`Test port map up to date: ${rows.length} files.`);
      }
      return rows;
    }
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, `${markdown}\n`);
    console.log(`Test port map written: ${rows.length} backend test files.`);
    return rows;
  }
  const registries = await loadRegistries(root);
  const inventory = buildInventory({
    root,
    deps: {
      ...registries,
      jobs: jobDefinitions(root),
      usage: eventUsage(root),
      index: testIndex(root),
    },
  });
  const jsonPath = path.join(root, 'api', 'inventory.json');
  const markdownPath = path.join(root, 'evidence', 'SPEC-2001', 'inventory.md');
  const json = serialize(inventory);
  const markdown = renderInventoryMarkdown(inventory);

  if (check) {
    const current = fs.existsSync(jsonPath) ? readText(jsonPath) : '';
    if (current !== json) {
      console.error('Inventory drift: api/inventory.json does not match the registries (CA-2).');
      process.exitCode = 1;
      return inventory;
    }
    console.log(`Inventory up to date: ${inventory.counts.operations} operations.`);
    return inventory;
  }

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(jsonPath, json);
  fs.writeFileSync(markdownPath, `${markdown}\n`);
  console.log(
    `Inventory written: ${inventory.counts.operations} operations, ` +
      `${inventory.counts.special} special routes, ${inventory.counts.events} events, ` +
      `${inventory.counts.jobs} jobs, ${inventory.counts.gaps} without test.`,
  );
  return inventory;
}

const entry = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (entry !== null && fileURLToPath(entry) === fileURLToPath(import.meta.url)) {
  await main();
}
